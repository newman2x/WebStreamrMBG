import winston from 'winston';
import { createTestContext } from '../test';
import { Format } from '../types';
import { FetcherMock } from '../utils';
import { ExtractorRegistry } from './ExtractorRegistry';
import { HBLinks } from './HBLinks';
import { HubExtractor } from './HubExtractor';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const fixtureBase = `${__dirname}/__fixtures__/HBLinks`;

const ctx = createTestContext();

describe('HBLinks', () => {
  test('handles page with HubCDN links', async () => {
    const hubExtractor = new HubExtractor(new FetcherMock(fixtureBase), logger);
    const extractorRegistry = new ExtractorRegistry(logger, [
      new HBLinks(new FetcherMock(fixtureBase), logger, hubExtractor),
      hubExtractor,
    ]);

    jest.spyOn(hubExtractor, 'extract').mockResolvedValue([
      { url: new URL('https://video-downloads.googleusercontent.com/testcdn123'), format: Format.unknown, label: 'HubCloud', ttl: 120000 },
    ]);

    const result = await extractorRegistry.handle(ctx, new URL('https://hblinks.dad/archives/123'));
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(r => r.url.href.includes('googleusercontent.com'))).toBe(true);
  });

  test('handles page with HubCloud links only', async () => {
    const hubExtractor = new HubExtractor(new FetcherMock(fixtureBase), logger);
    const extractorRegistry = new ExtractorRegistry(logger, [
      new HBLinks(new FetcherMock(fixtureBase), logger, hubExtractor),
      hubExtractor,
    ]);

    jest.spyOn(hubExtractor, 'extract').mockResolvedValue([
      { url: new URL('https://hub.test-cdn.buzz/cloudonly123'), format: Format.unknown, label: 'HubCloud (FSL)', ttl: 120000 },
    ]);

    const result = await extractorRegistry.handle(ctx, new URL('https://hblinks.dad/archives/456'));
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(r => r.label.includes('HubCloud'))).toBe(true);
  });

  test('handles page with HubDrive links only', async () => {
    const hubExtractor = new HubExtractor(new FetcherMock(fixtureBase), logger);
    const extractorRegistry = new ExtractorRegistry(logger, [
      new HBLinks(new FetcherMock(fixtureBase), logger, hubExtractor),
      hubExtractor,
    ]);

    jest.spyOn(hubExtractor, 'extract').mockResolvedValue([
      { url: new URL('https://hub.test-cdn.buzz/fromdrive'), format: Format.unknown, label: 'HubCloud (FSL)', ttl: 120000 },
    ]);

    const result = await extractorRegistry.handle(ctx, new URL('https://hblinks.dad/archives/789'));
    expect(result.length).toBeGreaterThan(0);
  });

  test('returns empty for page with no matching links', async () => {
    const hubExtractor = new HubExtractor(new FetcherMock(fixtureBase), logger);
    const extractorRegistry = new ExtractorRegistry(logger, [
      new HBLinks(new FetcherMock(fixtureBase), logger, hubExtractor),
      hubExtractor,
    ]);

    const result = await extractorRegistry.handle(ctx, new URL('https://hblinks.dad/archives/nolinks'));
    expect(result).toEqual([]);
  });

  test('does not match non-hblinks URLs', () => {
    const hubExtractor = new HubExtractor(new FetcherMock(fixtureBase), logger);
    const hblinks = new HBLinks(new FetcherMock(fixtureBase), logger, hubExtractor);
    expect(hblinks.supports(ctx, new URL('https://hubcloud.one/drive/test'))).toBe(false);
    expect(hblinks.supports(ctx, new URL('https://hubdrive.space/file/test'))).toBe(false);
    expect(hblinks.supports(ctx, new URL('https://example.com/page'))).toBe(false);
  });

  test('matches hblinks URLs', () => {
    const hubExtractor = new HubExtractor(new FetcherMock(fixtureBase), logger);
    const hblinks = new HBLinks(new FetcherMock(fixtureBase), logger, hubExtractor);
    expect(hblinks.supports(ctx, new URL('https://hblinks.dad/archives/123'))).toBe(true);
  });

  test('returns empty when fetch fails', async () => {
    const fetcher = new FetcherMock(fixtureBase);
    const hubExtractor = new HubExtractor(new FetcherMock(fixtureBase), logger);
    const hblinks = new HBLinks(fetcher, logger, hubExtractor);

    jest.spyOn(fetcher, 'text').mockRejectedValueOnce(new Error('Network error'));

    const result = await hblinks.extract(ctx, new URL('https://hblinks.dad/archives/fail'), {});
    expect(result).toEqual([]);
  });

  test('uses meta.title fallback when page title is empty', async () => {
    const fetcher = new FetcherMock(fixtureBase);
    const hubExtractor = new HubExtractor(new FetcherMock(fixtureBase), logger);
    const hblinks = new HBLinks(fetcher, logger, hubExtractor);

    // Page with empty title element — should use meta.title fallback
    const htmlWithEmptyTitle = `<!DOCTYPE html><html><head><title></title></head><body>
      <a href="https://hubcdn.fans/file/testcdn123">HubCDN</a>
    </body></html>`;

    jest.spyOn(fetcher, 'text').mockResolvedValueOnce(htmlWithEmptyTitle);
    jest.spyOn(hubExtractor, 'extract').mockResolvedValue([
      { url: new URL('https://video-downloads.googleusercontent.com/test'), format: Format.unknown, label: 'HubCloud', ttl: 120000 },
    ]);

    const result = await hblinks.extract(ctx, new URL('https://hblinks.dad/archives/emptytitle'), { title: 'Fallback Title' });
    expect(result.length).toBeGreaterThan(0);
  });

  test('deduplicates duplicate links on the page', async () => {
    const fetcher = new FetcherMock(fixtureBase);
    const hubExtractor = new HubExtractor(new FetcherMock(fixtureBase), logger);
    const hblinks = new HBLinks(fetcher, logger, hubExtractor);

    // Page with duplicate hubcdn.fans links — should only process each unique URL once
    const htmlWithDupes = `<!DOCTYPE html><html><head><title>Dup Test 2024</title></head><body>
      <a href="https://hubcdn.fans/file/testcdn123">HubCDN 1</a>
      <a href="https://hubcdn.fans/file/testcdn123">HubCDN 2 (duplicate)</a>
    </body></html>`;

    jest.spyOn(fetcher, 'text').mockResolvedValueOnce(htmlWithDupes);
    const extractSpy = jest.spyOn(hubExtractor, 'extract').mockResolvedValue([
      { url: new URL('https://video-downloads.googleusercontent.com/test'), format: Format.unknown, label: 'HubCloud', ttl: 120000 },
    ]);

    const result = await hblinks.extract(ctx, new URL('https://hblinks.dad/archives/dupes'), {});
    // hubExtractor.extract should only be called once (dedup prevents second call)
    expect(extractSpy).toHaveBeenCalledTimes(1);
    expect(result.length).toBeGreaterThan(0);
  });

  test('skips invalid URLs in link extraction', async () => {
    const fetcher = new FetcherMock(fixtureBase);
    const hubExtractor = new HubExtractor(new FetcherMock(fixtureBase), logger);
    const hblinks = new HBLinks(fetcher, logger, hubExtractor);

    // Page with an invalid hubcloud URL that can't be parsed
    const htmlWithInvalidUrl = `<!DOCTYPE html><html><head><title>Invalid URL Test</title></head><body>
      <a href="https://hubcloud.one/drive/valid123">Valid HubCloud</a>
      <a href="http://[invalid-url">Invalid URL</a>
    </body></html>`;

    jest.spyOn(fetcher, 'text').mockResolvedValueOnce(htmlWithInvalidUrl);
    jest.spyOn(hubExtractor, 'extract').mockResolvedValue([
      { url: new URL('https://hub.test-cdn.buzz/valid'), format: Format.unknown, label: 'HubCloud (FSL)', ttl: 120000 },
    ]);

    const result = await hblinks.extract(ctx, new URL('https://hblinks.dad/archives/invalid'), {});
    expect(result.length).toBeGreaterThan(0);
  });

  test('processes ALL link types (HubCDN + HubCloud) when both present', async () => {
    const fetcher = new FetcherMock(fixtureBase);
    const hubExtractor = new HubExtractor(new FetcherMock(fixtureBase), logger);
    const hblinks = new HBLinks(fetcher, logger, hubExtractor);

    const htmlWithBoth = `<!DOCTYPE html><html><head><title>All Links Test 2024</title></head><body>
      <a href="https://hubcdn.fans/file/cdn123">HubCDN</a>
      <a href="https://hubcloud.one/drive/cloud123">HubCloud</a>
    </body></html>`;

    jest.spyOn(fetcher, 'text').mockResolvedValueOnce(htmlWithBoth);
    // HubCDN returns results
    jest.spyOn(hubExtractor, 'extract')
      .mockResolvedValueOnce([
        { url: new URL('https://video-downloads.googleusercontent.com/cdn123'), format: Format.unknown, label: 'HubCloud', ttl: 120000 },
      ])
      // HubCloud ALSO returns results — both should be present
      .mockResolvedValueOnce([
        { url: new URL('https://hub.test-cdn.buzz/cloud123'), format: Format.unknown, label: 'HubCloud (FSL)', ttl: 120000 },
      ]);

    const result = await hblinks.extract(ctx, new URL('https://hblinks.dad/archives/alllinks'), {});
    // BOTH HubCDN and HubCloud results should be present
    expect(result.length).toBe(2);
    expect(result.some(r => r.url.href.includes('googleusercontent.com'))).toBe(true);
    expect(result.some(r => r.url.href.includes('hub.test-cdn.buzz'))).toBe(true);
  });

  test('handles HubCDN extraction failure gracefully', async () => {
    const fetcher = new FetcherMock(fixtureBase);
    const hubExtractor = new HubExtractor(new FetcherMock(fixtureBase), logger);
    const hblinks = new HBLinks(fetcher, logger, hubExtractor);

    const htmlWithCdnAndCloud = `<!DOCTYPE html><html><head><title>Fallback Test 2024</title></head><body>
      <a href="https://hubcdn.fans/file/testcdn123">HubCDN</a>
      <a href="https://hubcloud.one/drive/cloudonly123">HubCloud</a>
    </body></html>`;

    jest.spyOn(fetcher, 'text').mockResolvedValueOnce(htmlWithCdnAndCloud);
    // HubCDN extraction fails
    jest.spyOn(hubExtractor, 'extract')
      .mockRejectedValueOnce(new Error('HubCDN failed'))
      // HubCloud extraction succeeds — always tried since we process ALL link types
      .mockResolvedValueOnce([
        { url: new URL('https://hub.test-cdn.buzz/cloud'), format: Format.unknown, label: 'HubCloud (FSL)', ttl: 120000 },
      ]);

    const result = await hblinks.extract(ctx, new URL('https://hblinks.dad/archives/cdnfail'), {});
    // HubCloud results should be present even though HubCDN also existed
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(r => r.url.href.includes('hub.test-cdn.buzz'))).toBe(true);
  });

  test('delegates all hub link types to HubExtractor', async () => {
    const fetcher = new FetcherMock(fixtureBase);
    const hubExtractor = new HubExtractor(new FetcherMock(fixtureBase), logger);
    const hblinks = new HBLinks(fetcher, logger, hubExtractor);

    const htmlWithAllTypes = `<!DOCTYPE html><html><head><title>All Types Test 2024</title></head><body>
      <a href="https://hubcdn.fans/file/cdn123">HubCDN</a>
      <a href="https://hubcloud.one/drive/cloud123">HubCloud</a>
      <a href="https://hubdrive.space/file/drive123">HubDrive</a>
    </body></html>`;

    jest.spyOn(fetcher, 'text').mockResolvedValueOnce(htmlWithAllTypes);
    const extractSpy = jest.spyOn(hubExtractor, 'extract').mockResolvedValue([
      { url: new URL('https://video-downloads.googleusercontent.com/test'), format: Format.unknown, label: 'HubCloud', ttl: 120000 },
    ]);

    await hblinks.extract(ctx, new URL('https://hblinks.dad/archives/alltypes'), {});

    // hubExtractor.extract() should be called for each hub link type
    expect(extractSpy).toHaveBeenCalledTimes(3);
    expect(extractSpy).toHaveBeenCalledWith(ctx, new URL('https://hubcdn.fans/file/cdn123'), expect.any(Object));
    expect(extractSpy).toHaveBeenCalledWith(ctx, new URL('https://hubcloud.one/drive/cloud123'), expect.any(Object));
    expect(extractSpy).toHaveBeenCalledWith(ctx, new URL('https://hubdrive.space/file/drive123'), expect.any(Object));
  });
});
