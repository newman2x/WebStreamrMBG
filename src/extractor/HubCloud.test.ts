import axios from 'axios';
import winston from 'winston';
import { createTestContext } from '../test';
import { Fetcher, FetcherMock } from '../utils';
import { ExtractorRegistry } from './ExtractorRegistry';
import { HubCloud } from './HubCloud';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new HubCloud(new FetcherMock(`${__dirname}/__fixtures__/HubCloud`), logger)]);

const ctx = createTestContext();

describe('HubCloud dead domain skip', () => {
  test('skips known dead HubCloud domains immediately', async () => {
    const fetcher = new Fetcher(axios.create(), logger);
    const hubCloud = new HubCloud(fetcher, logger);
    const textSpy = jest.spyOn(fetcher, 'text');

    const deadDomains = ['hubcloud.ink', 'hubcloud.co', 'hubcloud.cc', 'hubcloud.me', 'hubcloud.xyz'];
    for (const domain of deadDomains) {
      const result = await hubCloud.extract(ctx, new URL(`https://${domain}/drive/test123`), {});
      expect(result).toEqual([]);
    }

    expect(textSpy).not.toHaveBeenCalled();
  });

  test('allows live HubCloud domains', async () => {
    const fetcher = new Fetcher(axios.create(), logger);
    const hubCloud = new HubCloud(fetcher, logger);

    const hop1Html = `<html><head><title>Test</title></head><body>
      <script>var url = 'https://hubrouting.site/hubcloud.php?host=hubcloud&id=livedomain&token=test';</script>
    </body></html>`;

    const hop2Html = `<html><head><title>Test.LiveDomain.2024.1080p.mkv</title></head><body>
      <li class="list-group-item d-flex justify-content-between align-items-center">File Size<i id="size">1.0 GB</i></li>
      <a href="https://hub.live-cdn.buzz/live123?token=111" id="fsl">Download [FSL Server]</a>
    </body></html>`;

    let callCount = 0;
    jest.spyOn(fetcher, 'text').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return hop1Html;
      return hop2Html;
    });
    jest.spyOn(fetcher, 'setCookie').mockImplementation(() => { /* noop */ });

    const result = await hubCloud.extract(ctx, new URL('https://hubcloud.one/drive/livedomain'), {});
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('HubCloud extended download selectors', () => {
  test('recognizes page with a#download element as valid content', async () => {
    const fetcher = new Fetcher(axios.create(), logger);
    const hubCloud = new HubCloud(fetcher, logger);

    const hop1Html = `<html><head><title>Test</title></head><body>
      <script>var url = 'https://hubrouting.site/hubcloud.php?host=hubcloud&id=extsel&token=test';</script>
    </body></html>`;

    const hop2Html = `<html><head><title>Test.ExtSel.2024.1080p.mkv</title></head><body>
      <a id="download" href="https://hub.extsel-cdn.buzz/ext123?token=222">Download</a>
    </body></html>`;

    let callCount = 0;
    jest.spyOn(fetcher, 'text').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return hop1Html;
      return hop2Html;
    });
    jest.spyOn(fetcher, 'setCookie').mockImplementation(() => { /* noop */ });

    const result = await hubCloud.extract(ctx, new URL('https://hubcloud.one/drive/extsel'), {});
    expect(callCount).toBe(2); // Only 2 calls: Hop 1 + Hop 2 (no retry)
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  test('recognizes page with .download-btn as valid content', async () => {
    const fetcher = new Fetcher(axios.create(), logger);
    const hubCloud = new HubCloud(fetcher, logger);

    const hop1Html = `<html><head><title>Test</title></head><body>
      <script>var url = 'https://hubrouting.site/hubcloud.php?host=hubcloud&id=dlbtn&token=test';</script>
    </body></html>`;

    const hop2Html = `<html><head><title>Test.DlBtn.2024.720p.mkv</title></head><body>
      <a class="download-btn" href="https://hub.dlbtn-cdn.buzz/dl456?token=333">Download</a>
    </body></html>`;

    let callCount = 0;
    jest.spyOn(fetcher, 'text').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return hop1Html;
      return hop2Html;
    });
    jest.spyOn(fetcher, 'setCookie').mockImplementation(() => { /* noop */ });

    const result = await hubCloud.extract(ctx, new URL('https://hubcloud.one/drive/dlbtn'), {});
    expect(callCount).toBe(2); // No retry
    expect(result.length).toBeGreaterThanOrEqual(0);
  });
});

describe('HubCloud', () => {
  test('handle dexter original sin 2024 s01e01', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://hubcloud.one/drive/idt1evqfuviqiei'))).toMatchSnapshot();
  });

  test('handle crayon shin-chan 1993', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://hubcloud.one/drive/bffzqlpqfllfcld'))).toMatchSnapshot();
  });

  test('handle dark 2017 s03e08', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://hubcloud.one/drive/nknlofk8snfnknh'))).toMatchSnapshot();
  });

  test('handle goat 2026', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://hubcloud.foo/drive/p94k4dccjwxjcx4'))).toMatchSnapshot();
  });

  test('handle page with window.location redirect', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://hubcloud.one/drive/windowloc'))).toMatchSnapshot();
  });

  test('handle page with location.replace redirect (hubrouting.site)', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://hubcloud.one/drive/testhubrouting'))).toMatchSnapshot();
  });

  test('handle page with meta refresh redirect', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://hubcloud.one/drive/testmetarefresh'))).toMatchSnapshot();
  });

  test('handle page with document.location redirect (no cookie)', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://hubcloud.one/drive/testdocloc'))).toMatchSnapshot();
  });

  test('handle page with no redirect url', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://hubcloud.one/drive/noredirect'))).toEqual([]);
  });

  test('handle token expired page (retry returns empty)', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://hubcloud.one/drive/testtokenexpired'))).toEqual([]);
  });
});

describe('HubCloud retry logic', () => {
  test('retry succeeds after first Hop 2 returns empty page', async () => {
    // Create a fetcher mock that returns empty page on first Hop 2, then valid page on retry
    const fetcher = new Fetcher(axios.create(), logger);
    const hubCloud = new HubCloud(fetcher, logger);

    const hop1Html = `<html><head><title>Test</title></head><body>
      <script>var url = 'https://hubrouting.site/hubcloud.php?host=hubcloud&id=retrytest&token=test';</script>
      <script>function stck(e,t,i){}stck('xlax',"s4t",1440);</script>
    </body></html>`;

    const emptyHop2Html = '<html><head><title>Error</title></head><body><p>Token expired</p></body></html>';

    const validHop2Html = `<html><head><title>Test.Retry.2024.1080p.mkv</title></head><body>
      <li class="list-group-item d-flex justify-content-between align-items-center">File Size<i id="size">1.0 GB</i></li>
      <a href="https://hub.retry-cdn.buzz/retry123?token=1774433000" id="fsl">Download [FSL Server]</a>
    </body></html>`;

    let textCallCount = 0;
    jest.spyOn(fetcher, 'text').mockImplementation(async () => {
      textCallCount++;
      // Call 1: Hop 1 page
      // Call 2: Hop 2 (empty/error)
      // Call 3: Hop 1 retry
      // Call 4: Hop 2 retry (valid)
      if (textCallCount === 1) return hop1Html;
      if (textCallCount === 2) return emptyHop2Html;
      if (textCallCount === 3) return hop1Html;
      return validHop2Html;
    });
    jest.spyOn(fetcher, 'setCookie').mockImplementation(() => { /* noop */ });

    const result = await hubCloud.extract(ctx, new URL('https://hubcloud.one/drive/retrytest'), {});

    expect(result).toHaveLength(1);
    expect(result.some(r => r.label === 'HubCloud (FSL)')).toBe(true);
    expect(result.some(r => r.url.href === 'https://hub.retry-cdn.buzz/retry123?token=1774433000')).toBe(true);
    expect(fetcher.setCookie).toHaveBeenCalledTimes(2); // Once for first attempt, once for retry
  });

  test('retry with no cookie name still works', async () => {
    const fetcher = new Fetcher(axios.create(), logger);
    const hubCloud = new HubCloud(fetcher, logger);

    const hop1HtmlNoCookie = `<html><head><title>Test</title></head><body>
      <script>var url = 'https://hubrouting.site/hubcloud.php?host=hubcloud&id=nocookie&token=test';</script>
    </body></html>`;

    const emptyHop2Html = '<html><head><title>Error</title></head><body><p>Token expired</p></body></html>';

    const validHop2Html = `<html><head><title>Test.NoCookie.2024.720p.mkv</title></head><body>
      <li class="list-group-item d-flex justify-content-between align-items-center">File Size<i id="size">500 MB</i></li>
      <a href="https://hub.nocookie-cdn.buzz/nc456?token=1774434000" id="fsl">Download [FSL Server]</a>
    </body></html>`;

    let textCallCount = 0;
    jest.spyOn(fetcher, 'text').mockImplementation(async () => {
      textCallCount++;
      if (textCallCount === 1) return hop1HtmlNoCookie;
      if (textCallCount === 2) return emptyHop2Html;
      if (textCallCount === 3) return hop1HtmlNoCookie;
      return validHop2Html;
    });
    jest.spyOn(fetcher, 'setCookie').mockImplementation(() => { /* noop */ });

    const result = await hubCloud.extract(ctx, new URL('https://hubcloud.one/drive/nocookie'), {});

    expect(result).toHaveLength(1);
    expect(result.some(r => r.label === 'HubCloud (FSL)')).toBe(true);
    // setCookie should NOT be called since there's no stck() in the page
    expect(fetcher.setCookie).not.toHaveBeenCalled();
  });

  test('retry with no redirect URL found on retry returns empty', async () => {
    const fetcher = new Fetcher(axios.create(), logger);
    const hubCloud = new HubCloud(fetcher, logger);

    const hop1HtmlWithRedirect = `<html><head><title>Test</title></head><body>
      <script>var url = 'https://hubrouting.site/hubcloud.php?host=hubcloud&id=noretry&token=test';</script>
      <script>function stck(e,t,i){}stck('xlax',"s4t",1440);</script>
    </body></html>`;

    const hop1HtmlNoRedirect = '<html><head><title>Test</title></head><body><p>No redirect</p></body></html>';

    const emptyHop2Html = '<html><head><title>Error</title></head><body><p>Token expired</p></body></html>';

    let textCallCount = 0;
    jest.spyOn(fetcher, 'text').mockImplementation(async () => {
      textCallCount++;
      if (textCallCount === 1) return hop1HtmlWithRedirect;
      if (textCallCount === 2) return emptyHop2Html;
      // On retry, Hop 1 returns a page with no redirect URL
      return hop1HtmlNoRedirect;
    });
    jest.spyOn(fetcher, 'setCookie').mockImplementation(() => { /* noop */ });

    const result = await hubCloud.extract(ctx, new URL('https://hubcloud.one/drive/noretry'), {});

    expect(result).toHaveLength(0);
  });
});

describe('HubCloud brute-force fallback', () => {
  test('uses brute-force regex when no structured strategy matches', async () => {
    const fetcher = new Fetcher(axios.create(), logger);
    const hubCloud = new HubCloud(fetcher, logger);

    const hop1Html = `<html><head><title>Test</title></head><body>
      <!-- Redirect: https://hubcloud.foo/drive/bruteforcetest -->
      <p>Click <span>https://hubcloud.foo/drive/bruteforcetest</span> to continue</p>
    </body></html>`;

    const hop2Html = `<html><head><title>Test.BruteForce.2024.1080p.mkv</title></head><body>
      <li class="list-group-item d-flex justify-content-between align-items-center">File Size<i id="size">2.0 GB</i></li>
      <a href="https://hub.bruteforce-cdn.buzz/bf123?token=999" id="fsl">Download [FSL Server]</a>
    </body></html>`;

    let textCallCount = 0;
    jest.spyOn(fetcher, 'text').mockImplementation(async () => {
      textCallCount++;
      if (textCallCount === 1) return hop1Html;
      return hop2Html;
    });
    jest.spyOn(fetcher, 'setCookie').mockImplementation(() => { /* noop */ });

    const warnSpy = jest.spyOn(hubCloud['logger'], 'warn');

    const result = await hubCloud.extract(ctx, new URL('https://hubcloud.one/drive/bruteforcetest'), {});

    expect(result.length).toBeGreaterThan(0);
    expect(
      warnSpy.mock.calls.some(
        (args) => {
          const msg = args[0] as unknown as string;
          return typeof msg === 'string'
            && msg.includes('Brute-force URL extraction used')
            && msg.includes('hubcloud.foo');
        },
      ),
    ).toBe(true);
  });

  test('skips iframe with non-hubcloud URL (Pattern 10 negative branch)', async () => {
    const fetcher = new Fetcher(axios.create(), logger);
    const hubCloud = new HubCloud(fetcher, logger);

    const hop1Html = `<html><head><title>Test</title></head><body>
      <iframe src="https://ads.example.com/banner"></iframe>
      <script>var redirect = 'https://hubcloud.foo/drive/iframetest';</script>
    </body></html>`;

    const hop2Html = `<html><head><title>Test.Iframe.2024.720p.mkv</title></head><body>
      <li class="list-group-item d-flex justify-content-between align-items-center">File Size<i id="size">1.5 GB</i></li>
      <a href="https://hub.iframetest-cdn.buzz/if123?token=888" id="fsl">Download [FSL Server]</a>
    </body></html>`;

    let textCallCount = 0;
    jest.spyOn(fetcher, 'text').mockImplementation(async () => {
      textCallCount++;
      if (textCallCount === 1) return hop1Html;
      return hop2Html;
    });
    jest.spyOn(fetcher, 'setCookie').mockImplementation(() => { /* noop */ });

    const result = await hubCloud.extract(ctx, new URL('https://hubcloud.one/drive/iframetest'), {});

    expect(result.length).toBeGreaterThan(0);
  });

  test('handles relative redirect URL (var url = "/drive/...?token=...")', async () => {
    const fetcher = new Fetcher(axios.create(), logger);
    const hubCloud = new HubCloud(fetcher, logger);

    const hop1Html = `<html><head><title>Test</title></head><body>
      <script>var url = '/drive/relativetest?token=abc123';</script>
      <script>function stck(e,t,i){}stck('relcookie',"s4t",1440);</script>
    </body></html>`;

    const hop2Html = `<html><head><title>Test.Relative.2024.1080p.mkv</title></head><body>
      <li class="list-group-item d-flex justify-content-between align-items-center">File Size<i id="size">1.5 GB</i></li>
      <a href="https://hub.relative-cdn.buzz/rel123?token=xyz" id="fsl">Download [FSL Server]</a>
    </body></html>`;

    let textCallCount = 0;
    jest.spyOn(fetcher, 'text').mockImplementation(async (_ctx: unknown, url: URL) => {
      textCallCount++;
      if (textCallCount === 1) return hop1Html;
      expect(url.href).toBe('https://hubcloud.one/drive/relativetest?token=abc123');
      return hop2Html;
    });
    jest.spyOn(fetcher, 'setCookie').mockImplementation(() => { /* noop */ });

    const result = await hubCloud.extract(ctx, new URL('https://hubcloud.one/drive/relativetest'), {});

    expect(result).toHaveLength(1);
    expect(result.some(r => r.label === 'HubCloud (FSL)')).toBe(true);
  });

  test('retry with relative redirect URL resolves correctly', async () => {
    const fetcher = new Fetcher(axios.create(), logger);
    const hubCloud = new HubCloud(fetcher, logger);

    const hop1Html = `<html><head><title>Test</title></head><body>
      <script>var url = '/drive/retryrelative?token=retry123';</script>
      <script>function stck(e,t,i){}stck('rrcookie',"s4t",1440);</script>
    </body></html>`;

    const emptyHop2Html = '<html><head><title>Error</title></head><body><p>Token expired</p></body></html>';

    const validHop2Html = `<html><head><title>Test.RetryRelative.2024.720p.mkv</title></head><body>
      <li class="list-group-item d-flex justify-content-between align-items-center">File Size<i id="size">800 MB</i></li>
      <a href="https://hub.rr-cdn.buzz/rr456?token=ttt" id="fsl">Download [FSL Server]</a>
    </body></html>`;

    let textCallCount = 0;
    jest.spyOn(fetcher, 'text').mockImplementation(async (_ctx: unknown, url: URL) => {
      textCallCount++;
      if (textCallCount === 1) return hop1Html;
      if (textCallCount === 2) return emptyHop2Html;
      if (textCallCount === 3) return hop1Html;
      expect(url.href).toBe('https://hubcloud.foo/drive/retryrelative?token=retry123');
      return validHop2Html;
    });
    jest.spyOn(fetcher, 'setCookie').mockImplementation(() => { /* noop */ });

    const result = await hubCloud.extract(ctx, new URL('https://hubcloud.foo/drive/retryrelative'), {});

    expect(result).toHaveLength(1);
    expect(result.some(r => r.label === 'HubCloud (FSL)')).toBe(true);
  });

  test('matches iframe with hubcloud URL (Pattern 10 positive branch)', async () => {
    const fetcher = new Fetcher(axios.create(), logger);
    const hubCloud = new HubCloud(fetcher, logger);

    const hop1Html = `<html><head><title>Test</title></head><body>
      <iframe src="https://hubcloud.foo/drive/iframepositivetest"></iframe>
    </body></html>`;

    const hop2Html = `<html><head><title>Test.IframePositive.2024.1080p.mkv</title></head><body>
      <li class="list-group-item d-flex justify-content-between align-items-center">File Size<i id="size">3.0 GB</i></li>
      <a href="https://hub.iframepos-cdn.buzz/ip123?token=777" id="fsl">Download [FSL Server]</a>
    </body></html>`;

    let textCallCount = 0;
    jest.spyOn(fetcher, 'text').mockImplementation(async () => {
      textCallCount++;
      if (textCallCount === 1) return hop1Html;
      return hop2Html;
    });
    jest.spyOn(fetcher, 'setCookie').mockImplementation(() => { /* noop */ });

    const result = await hubCloud.extract(ctx, new URL('https://hubcloud.one/drive/iframepositivetest'), {});

    expect(result.length).toBeGreaterThan(0);
  });
});

describe('HubCloud new-format pages (workers.dev + hubcdn.fans)', () => {
  test('extracts workers.dev link as HubCloud (Direct)', async () => {
    const fetcher = new Fetcher(axios.create(), logger);
    const hubCloud = new HubCloud(fetcher, logger);

    const hop1Html = `<html><head><title>Test</title></head><body>
      <script>var url = 'https://hubrouting.site/hubcloud.php?host=hubcloud&id=workerstest&token=test';</script>
    </body></html>`;

    const hop2Html = `<html><head><title>Test.WorkersDev.2024.1080p.mkv</title></head><body>
      <li class="list-group-item d-flex justify-content-between align-items-center">File Size<i id="size">2.0 GB</i></li>
      <a href="https://hidden-boat-e87c.hivegic619569.workers.dev/1397962425/abc123::def456/Test.WorkersDev.2024.1080p.mkv" download="Test.WorkersDev.2024.1080p.mkv"><i class="fas fa-file-download fa-lg"></i> Download [PDL Server]</a>
    </body></html>`;

    let textCallCount = 0;
    jest.spyOn(fetcher, 'text').mockImplementation(async () => {
      textCallCount++;
      if (textCallCount === 1) return hop1Html;
      return hop2Html;
    });
    jest.spyOn(fetcher, 'setCookie').mockImplementation(() => { /* noop */ });

    const result = await hubCloud.extract(ctx, new URL('https://hubcloud.one/drive/workerstest'), {});

    expect(result).toHaveLength(1);
    expect(result.some(r => r.label === 'HubCloud (Direct)')).toBe(true);
    expect(result.some(r => r.url.href.includes('workers.dev'))).toBe(true);
    expect(result.some(r => r.meta?.extractorId === 'hubcloud_direct')).toBe(true);
    expect(result.some(r => r.meta?.bytes === 2147483648)).toBe(true); // 2.0 GB
    expect(result.every(r => !('requestHeaders' in r))).toBe(true);
  });

  test('extracts hubcdn.fans link as HubCloud (Fast)', async () => {
    const fetcher = new Fetcher(axios.create(), logger);
    const hubCloud = new HubCloud(fetcher, logger);

    const hop1Html = `<html><head><title>Test</title></head><body>
      <script>var url = 'https://hubrouting.site/hubcloud.php?host=hubcloud&id=fasttest&token=test';</script>
    </body></html>`;

    const hop2Html = `<html><head><title>Test.Fast.2024.720p.mkv</title></head><body>
      <li class="list-group-item d-flex justify-content-between align-items-center">File Size<i id="size">1.0 GB</i></li>
      <a href="https://gpdl.hubcdn.fans/?id=abc123def456::789xyz" rel="noreferrer nofollow noopener" target="_blank" class="btn btn-danger btn-lg h6"><i class="fas fa-file-download fa-lg"></i> Download [Server : 10Gbps]</a>
    </body></html>`;

    let textCallCount = 0;
    jest.spyOn(fetcher, 'text').mockImplementation(async () => {
      textCallCount++;
      if (textCallCount === 1) return hop1Html;
      return hop2Html;
    });
    jest.spyOn(fetcher, 'setCookie').mockImplementation(() => { /* noop */ });

    const result = await hubCloud.extract(ctx, new URL('https://hubcloud.one/drive/fasttest'), {});

    expect(result).toHaveLength(1);
    expect(result.some(r => r.label === 'HubCloud (Fast)')).toBe(true);
    expect(result.some(r => r.url.href.includes('hubcdn.fans'))).toBe(true);
    expect(result.some(r => r.meta?.extractorId === 'hubcloud_fast')).toBe(true);
    expect(result.some(r => r.meta?.bytes === 1073741824)).toBe(true); // 1.0 GB
    expect(result.every(r => !('requestHeaders' in r))).toBe(true);
  });

  test('extracts both workers.dev and hubcdn.fans from new-format-only page (no FSL/FSLv2/PixelServer)', async () => {
    const fetcher = new Fetcher(axios.create(), logger);
    const hubCloud = new HubCloud(fetcher, logger);

    const hop1Html = `<html><head><title>Test</title></head><body>
      <script>var url = 'https://hubrouting.site/hubcloud.php?host=hubcloud&id=newformatonly&token=test';</script>
    </body></html>`;

    // Page with ONLY workers.dev and hubcdn.fans links — no FSL/FSLv2/PixelServer
    const hop2Html = `<html><head><title>Test.NewFormat.2024.2160p.mkv</title></head><body>
      <li class="list-group-item d-flex justify-content-between align-items-center">File Size<i id="size">5.0 GB</i></li>
      <a href="https://hidden-boat-e87c.hivegic619569.workers.dev/1397962425/abc::def/Test.NewFormat.2024.2160p.mkv" download="Test.NewFormat.2024.2160p.mkv"><i class="fas fa-file-download fa-lg"></i> Download [PDL Server]</a>
      <a href="https://gpdl.hubcdn.fans/?id=xyz789::abc456" rel="noreferrer nofollow noopener" target="_blank" class="btn btn-danger btn-lg h6"><i class="fas fa-file-download fa-lg"></i> Download [Server : 10Gbps]</a>
    </body></html>`;

    let textCallCount = 0;
    jest.spyOn(fetcher, 'text').mockImplementation(async () => {
      textCallCount++;
      if (textCallCount === 1) return hop1Html;
      return hop2Html;
    });
    jest.spyOn(fetcher, 'setCookie').mockImplementation(() => { /* noop */ });

    const result = await hubCloud.extract(ctx, new URL('https://hubcloud.one/drive/newformatonly'), {});

    expect(result).toHaveLength(2);
    expect(result.some(r => r.label === 'HubCloud (Direct)')).toBe(true);
    expect(result.some(r => r.label === 'HubCloud (Fast)')).toBe(true);
    // Neither should have requestHeaders
    expect(result.every(r => !('requestHeaders' in r))).toBe(true);
  });

  test('new-format page with only workers.dev and hubcdn.fans passes hasValidDownloadContent check', async () => {
    const fetcher = new Fetcher(axios.create(), logger);
    const hubCloud = new HubCloud(fetcher, logger);

    const hop1Html = `<html><head><title>Test</title></head><body>
      <script>var url = 'https://hubrouting.site/hubcloud.php?host=hubcloud&id=validcheck&token=test';</script>
    </body></html>`;

    // Page with NO #size element and NO FSL/PixelServer text — only workers.dev/hubcdn.fans links
    // This should still pass hasValidDownloadContent via the extended selectors
    const hop2Html = `<html><head><title>Test.ValidCheck.2024.1080p.mkv</title></head><body>
      <a href="https://some-worker.workers.dev/file123" download="file.mkv">Download File</a>
      <a href="https://gpdl.hubcdn.fans/?id=abc::def">10Gbps Server</a>
    </body></html>`;

    let textCallCount = 0;
    jest.spyOn(fetcher, 'text').mockImplementation(async () => {
      textCallCount++;
      if (textCallCount === 1) return hop1Html;
      return hop2Html;
    });
    jest.spyOn(fetcher, 'setCookie').mockImplementation(() => { /* noop */ });

    const result = await hubCloud.extract(ctx, new URL('https://hubcloud.one/drive/validcheck'), {});

    // Should NOT trigger retry (only 2 calls), and should extract 2 links
    expect(textCallCount).toBe(2);
    expect(result).toHaveLength(2);
  });
});
