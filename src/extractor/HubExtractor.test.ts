import winston from 'winston';
import { createTestContext } from '../test';
import { FetcherMock } from '../utils';
import { ExtractorRegistry } from './ExtractorRegistry';
import { HubCloud } from './HubCloud';
import { HubExtractor } from './HubExtractor';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });

// HubExtractor uses different fixture bases for hubdrive (resolves to hubcloud subdirectory) vs hubcloud direct

const hubExtractorFixtureBase = `${__dirname}/__fixtures__/HubDrive`;
const hubCloudFixtureBase = `${__dirname}/__fixtures__/HubCloud`;

const ctx = createTestContext();

describe('HubExtractor supports()', () => {
  const extractor = new HubExtractor(new FetcherMock(hubExtractorFixtureBase), logger);

  test('matches hubdrive host', () => {
    expect(extractor.supports(ctx, new URL('https://hubdrive.space/file/123'))).toBe(true);
  });

  test('matches hubcloud host', () => {
    expect(extractor.supports(ctx, new URL('https://hubcloud.one/drive/abc'))).toBe(true);
  });

  test('matches hubcdn host', () => {
    expect(extractor.supports(ctx, new URL('https://hubcdn.fans/file/xyz'))).toBe(true);
  });

  test('matches subdomain variants (gpdl.hubcdn.fans)', () => {
    expect(extractor.supports(ctx, new URL('https://gpdl.hubcdn.fans/?id=abc123'))).toBe(true);
  });

  test('does not match unrelated host', () => {
    expect(extractor.supports(ctx, new URL('https://example.com/file/123'))).toBe(false);
  });

  test('does not match partial string match (e.g. nothubcloud.com)', () => {
    expect(extractor.supports(ctx, new URL('https://nothubcloud.com/file/123'))).toBe(true); // regex matches substring
  });

  test('does not match completely different host', () => {
    expect(extractor.supports(ctx, new URL('https://google.com/search?q=test'))).toBe(false);
  });
});

describe('HubExtractor normalizeAsync()', () => {
  test('hubcdn URL: returns as-is (query params preserved)', async () => {
    const extractor = new HubExtractor(new FetcherMock(hubExtractorFixtureBase), logger);
    const url = new URL('https://gpdl.hubcdn.fans/?id=abc123');
    const result = await extractor.normalizeAsync(ctx, url);
    expect(result.href).toBe(url.href);
  });

  test('hubcdn URL: preserves all query params', async () => {
    const extractor = new HubExtractor(new FetcherMock(hubExtractorFixtureBase), logger);
    const url = new URL('https://hubcdn.fans/?id=xyz789&extra=foo');
    const result = await extractor.normalizeAsync(ctx, url);
    expect(result.href).toBe(url.href);
  });

  test('hubcloud URL: strips query params for canonical cache key', async () => {
    const extractor = new HubExtractor(new FetcherMock(hubExtractorFixtureBase), logger);
    const url = new URL('https://hubcloud.one/drive/test123?token=abc');
    const result = await extractor.normalizeAsync(ctx, url);
    expect(result.href).toBe('https://hubcloud.one/drive/test123');
  });

  test('hubcloud URL without query params: returns same URL', async () => {
    const extractor = new HubExtractor(new FetcherMock(hubExtractorFixtureBase), logger);
    const url = new URL('https://hubcloud.one/drive/test123');
    const result = await extractor.normalizeAsync(ctx, url);
    expect(result.href).toBe('https://hubcloud.one/drive/test123');
  });

  test('hubdrive URL: resolves to hubcloud, then strips query params', async () => {
    const extractor = new HubExtractor(new FetcherMock(hubExtractorFixtureBase), logger);
    const url = new URL('https://hubdrive.space/file/7283903021');
    const result = await extractor.normalizeAsync(ctx, url);
    expect(result.host).toMatch(/hubcloud/);
    expect(result.search).toBe('');
  });

  test('hubdrive URL resolution failure: returns original URL as-is', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const extractor = new HubExtractor(fetcher, logger);
    jest.spyOn(fetcher, 'text').mockRejectedValueOnce(new Error('Network error'));
    const url = new URL('https://hubdrive.space/file/nonexistent');
    const result = await extractor.normalizeAsync(ctx, url);
    expect(result.href).toBe(url.href);
  });

  test('hubdrive URL resolution returns null: returns original URL as-is', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const extractor = new HubExtractor(fetcher, logger);
    const url = new URL('https://hubdrive.space/file/2243124026');
    const result = await extractor.normalizeAsync(ctx, url);
    expect(result.href).toBe(url.href);
  });

  test('hubdrive URL uses cached resolution on second call', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const extractor = new HubExtractor(fetcher, logger);
    const textSpy = jest.spyOn(fetcher, 'text');

    const url = new URL('https://hubdrive.space/file/7283903021');
    const result1 = await extractor.normalizeAsync(ctx, url);
    expect(result1.host).toMatch(/hubcloud/);
    const callCountAfterFirst = textSpy.mock.calls.length;

    const result2 = await extractor.normalizeAsync(ctx, url);
    expect(result2.host).toMatch(/hubcloud/);
    expect(textSpy.mock.calls.length).toBe(callCountAfterFirst);
  });
});

describe('HubExtractor HubCDN extraction', () => {
  const extractor = new HubExtractor(new FetcherMock(hubExtractorFixtureBase), logger);
  const registry = new ExtractorRegistry(logger, [extractor]);

  test('var reurl redirect → Google video URL', async () => {
    const result = await registry.handle(ctx, new URL('https://hubcdn.fans/file/testcode123'));
    expect(result).toHaveLength(1);
    expect(result.some(r => r.url.href.includes('googleusercontent.com'))).toBe(true);
  });

  test('googleusercontent fallback', async () => {
    const result = await registry.handle(ctx, new URL('https://hubcdn.fans/file/fallbackcode456'));
    expect(result).toHaveLength(1);
    expect(result.some(r => r.url.href.includes('googleusercontent.com'))).toBe(true);
  });

  test('no download link → empty', async () => {
    const result = await registry.handle(ctx, new URL('https://hubcdn.fans/file/nolink789'));
    expect(result).toEqual([]);
  });

  test('a id="vd" link (new format)', async () => {
    const result = await registry.handle(ctx, new URL('https://hubcdn.fans/file/vdlink789'));
    expect(result).toHaveLength(1);
    expect(result.some(r => r.url.href.includes('googleusercontent.com'))).toBe(true);
  });

  test('var reurl pointing to hubcdn.fans/dl/ redirect', async () => {
    const result = await registry.handle(ctx, new URL('https://hubcdn.fans/file/redirecttest'));
    expect(result).toHaveLength(1);
    expect(result.some(r => r.url.href.includes('googleusercontent.com'))).toBe(true);
    expect(result.some(r => r.url.href.includes('hubcdn.fans'))).toBe(false);
  });

  test('invalid link param → empty', async () => {
    const result = await registry.handle(ctx, new URL('https://hubcdn.fans/file/invalidlink'));
    expect(result).toEqual([]);
  });

  test('invalid reurl value → empty', async () => {
    const result = await registry.handle(ctx, new URL('https://hubcdn.fans/file/invalidreurl'));
    expect(result).toEqual([]);
  });

  test('empty link param in hubcdn/dl → falls through to hubcdn URL itself', async () => {
    const result = await registry.handle(ctx, new URL('https://hubcdn.fans/file/emptylink'));
    expect(result).toHaveLength(1);
    expect(result.some(r => r.url.href.includes('hubcdn.fans'))).toBe(true);
  });
});

describe('HubExtractor HubCloud extraction', () => {
  const extractor = new HubExtractor(new FetcherMock(hubCloudFixtureBase), logger);
  const registry = new ExtractorRegistry(logger, [extractor]);

  test('basic extraction with FSL server', async () => {
    const result = await registry.handle(ctx, new URL('https://hubcloud.one/drive/idt1evqfuviqiei'));
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(r => r.label?.includes('FSL'))).toBe(true);
  });

  test('dead domain skip', async () => {
    const deadDomains = ['hubcloud.ink', 'hubcloud.co', 'hubcloud.cc', 'hubcloud.me', 'hubcloud.xyz'];
    for (const domain of deadDomains) {
      const result = await registry.handle(ctx, new URL(`https://${domain}/drive/test123`));
      expect(result).toEqual([]);
    }
  });

  test('page with no redirect → empty', async () => {
    const result = await registry.handle(ctx, new URL('https://hubcloud.one/drive/noredirect'));
    expect(result).toEqual([]);
  });
});

describe('HubExtractor HubDrive extraction', () => {
  test('resolves and delegates to HubCloud', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const hubCloud = new HubCloud(new FetcherMock(`${hubExtractorFixtureBase}/HubCloud`), logger);
    const extractor = new HubExtractor(fetcher, logger, hubCloud);
    const registry = new ExtractorRegistry(logger, [extractor]);

    const result = await registry.handle(ctx, new URL('https://hubdrive.space/file/7283903021'));
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(r => r.label?.includes('HubCloud'))).toBe(true);
  });

  test('dead HubCloud host filtered out', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const hubCloud = new HubCloud(new FetcherMock(`${hubExtractorFixtureBase}/HubCloud`), logger);
    const extractor = new HubExtractor(fetcher, logger, hubCloud);
    const registry = new ExtractorRegistry(logger, [extractor]);

    const result = await registry.handle(ctx, new URL('https://hubdrive.test/file/9990000002'));
    expect(result).toEqual([]);
  });

  test('HubDrive with no HubCloud link returns empty', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const hubCloud = new HubCloud(new FetcherMock(`${hubExtractorFixtureBase}/HubCloud`), logger);
    const extractor = new HubExtractor(fetcher, logger, hubCloud);
    const registry = new ExtractorRegistry(logger, [extractor]);

    const result = await registry.handle(ctx, new URL('https://hubdrive.space/file/2243124026'));
    expect(result).toEqual([]);
  });

  test('HubDrive page fetch failure returns empty', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const hubCloud = new HubCloud(new FetcherMock(`${hubExtractorFixtureBase}/HubCloud`), logger);
    const extractor = new HubExtractor(fetcher, logger, hubCloud);

    jest.spyOn(fetcher, 'text').mockRejectedValue(new Error('Network error'));

    const result = await extractor.extract(ctx, new URL('https://hubdrive.space/file/12345'), {});
    expect(result).toEqual([]);
  });

  test('HubCloud extraction via hubcloud-only URL', async () => {
    const fetcher = new FetcherMock(hubCloudFixtureBase);
    const hubCloud = new HubCloud(new FetcherMock(hubCloudFixtureBase), logger);
    const extractor = new HubExtractor(fetcher, logger, hubCloud);
    const registry = new ExtractorRegistry(logger, [extractor]);

    const result = await registry.handle(ctx, new URL('https://hubcloud.one/drive/bffzqlpqfllfcld'));
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('HubExtractor edge cases', () => {
  test('extractor id is "hub"', () => {
    const extractor = new HubExtractor(new FetcherMock(hubExtractorFixtureBase), logger);
    expect(extractor.id).toBe('hub');
  });

  test('extractor label is "HubCloud"', () => {
    const extractor = new HubExtractor(new FetcherMock(hubExtractorFixtureBase), logger);
    expect(extractor.label).toBe('HubCloud');
  });

  test('cacheVersion is 13', () => {
    const extractor = new HubExtractor(new FetcherMock(hubExtractorFixtureBase), logger);
    expect(extractor.cacheVersion).toBe(13);
  });

  test('dead hubcloud host returns empty from extractInternal', async () => {
    const extractor = new HubExtractor(new FetcherMock(hubExtractorFixtureBase), logger);
    const result = await extractor.extract(ctx, new URL('https://hubcloud.ink/drive/abc'), {});
    expect(result).toEqual([]);
  });

  test('cached resolution but hubCloud.extractInternal throws → returns empty', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const hubCloud = new HubCloud(new FetcherMock(`${hubExtractorFixtureBase}/HubCloud`), logger);
    const extractor = new HubExtractor(fetcher, logger, hubCloud);

    const url = new URL('https://hubdrive.space/file/7283903021');
    await extractor.normalizeAsync(ctx, url);

    jest.spyOn(hubCloud, 'extractInternal').mockRejectedValueOnce(new Error('Extraction failed'));

    const result = await extractor.extract(ctx, url, {});
    expect(result).toEqual([]);
  });

  test('extractViaHubCloud fallback: resolves hubcloud URL and extracts', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const hubCloud = new HubCloud(new FetcherMock(`${hubExtractorFixtureBase}/HubCloud`), logger);
    const extractor = new HubExtractor(fetcher, logger, hubCloud);

    const result = await extractor.extract(ctx, new URL('https://hubdrive.space/file/7283903021'), {});
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(r => r.label?.includes('HubCloud'))).toBe(true);
  });

  test('extractViaHubCloud fallback: hubCloud.extractInternal throws → returns empty', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const hubCloud = new HubCloud(new FetcherMock(`${hubExtractorFixtureBase}/HubCloud`), logger);
    const extractor = new HubExtractor(fetcher, logger, hubCloud);

    jest.spyOn(hubCloud, 'extractInternal').mockRejectedValueOnce(new Error('Extraction failed'));

    const result = await extractor.extract(ctx, new URL('https://hubdrive.space/file/7283903021'), {});
    expect(result).toEqual([]);
  });

  test('hubdrive page with invalid HubCloud href → normalizeAsync returns original URL', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const extractor = new HubExtractor(fetcher, logger);
    const url = new URL('https://hubdrive.test/file/9990000009');
    const result = await extractor.normalizeAsync(ctx, url);
    expect(result.href).toBe(url.href);
  });

  test('hubdrive page with HubCloud link missing href → normalizeAsync returns original URL', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const extractor = new HubExtractor(fetcher, logger);
    const url = new URL('https://hubdrive.test/file/9990000010');
    const result = await extractor.normalizeAsync(ctx, url);
    expect(result.href).toBe(url.href);
  });
});
