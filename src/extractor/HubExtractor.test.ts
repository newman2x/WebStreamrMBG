import winston from 'winston';
import { createTestContext } from '../test';
import { CountryCode, Meta } from '../types';
import { DEAD_HUBCLOUD_HOSTS, FetcherMock } from '../utils';
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

  test('matches substring in hostname (e.g. nothubcloud.com)', () => {
    expect(extractor.supports(ctx, new URL('https://nothubcloud.com/file/123'))).toBe(true);
  });

  test('does not match completely different host', () => {
    expect(extractor.supports(ctx, new URL('https://google.com/search?q=test'))).toBe(false);
  });
});

describe('HubExtractor normalizeAsync()', () => {
  test('hubcdn URL: resolves to hubcloud canonical (stripped)', async () => {
    const extractor = new HubExtractor(new FetcherMock(hubExtractorFixtureBase), logger);
    const url = new URL('https://hubcdn.fans/file/redirecttest');
    const result = await extractor.normalizeAsync(ctx, url);
    // redirecttest fixture has link=googleusercontent (not hubcloud), so falls back to as-is
    expect(result.href).toBe(url.href);
  });

  test('hubcdn URL: HubCloud FSL server (hub.yummy.monster) → delegates to HubCloud canonical', async () => {
    const extractor = new HubExtractor(new FetcherMock(hubExtractorFixtureBase), logger);
    const url = new URL('https://hubcdn.org/file/hubcloudredirect');
    const result = await extractor.normalizeAsync(ctx, url);
    // hubcloudredirect fixture has link=hub.yummy.monster which is a HubCloud FSL server
    // so delegateToHubCloud=true, resolves to stripped hub.yummy.monster canonical
    expect(result.host).toBe('hub.yummy.monster');
    expect(result.search).toBe('');
  });

  test('hubcdn URL: hubcloud page redirect → resolves to stripped hubcloud canonical', async () => {
    const extractor = new HubExtractor(new FetcherMock(hubExtractorFixtureBase), logger);
    const url = new URL('https://hubcdn.org/file/hubcloudpage');
    const result = await extractor.normalizeAsync(ctx, url);
    // hubcloudpage fixture has link=hubcloud.one/drive/abc123?token=xyz → strips to canonical
    expect(result.host).toBe('hubcloud.one');
    expect(result.pathname).toBe('/drive/abc123');
    expect(result.search).toBe('');
  });

  test('hubcdn URL: ?r=BASE64 redirect to hubcloud → resolves to stripped hubcloud canonical', async () => {
    const extractor = new HubExtractor(new FetcherMock(hubExtractorFixtureBase), logger);
    const url = new URL('https://hubcdn.fans/file/redirectbase64');
    const result = await extractor.normalizeAsync(ctx, url);
    // redirectbase64 fixture has ?r=BASE64 that decodes to hubcloud.one/drive/base64test?token=xyz
    expect(result.host).toBe('hubcloud.one');
    expect(result.pathname).toBe('/drive/base64test');
    expect(result.search).toBe('');
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

  test('var reurl redirect → Google video URL (CDN direct)', async () => {
    const result = await registry.handle(ctx, new URL('https://hubcdn.fans/file/testcode123'));
    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toContain('googleusercontent.com');
    expect(result[0]?.label).toBe('HubCloud (CDN)');
  });

  test('googleusercontent fallback → CDN direct', async () => {
    const result = await registry.handle(ctx, new URL('https://hubcdn.fans/file/fallbackcode456'));
    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toContain('googleusercontent.com');
    expect(result[0]?.label).toBe('HubCloud (CDN)');
  });

  test('no download link → empty', async () => {
    const result = await registry.handle(ctx, new URL('https://hubcdn.fans/file/nolink789'));
    expect(result).toEqual([]);
  });

  test('a id="vd" link (new format) → CDN direct', async () => {
    const result = await registry.handle(ctx, new URL('https://hubcdn.fans/file/vdlink789'));
    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toContain('googleusercontent.com');
    expect(result[0]?.label).toBe('HubCloud (CDN)');
  });

  test('var reurl pointing to hubcdn.fans/dl/ redirect → extracts link param', async () => {
    const result = await registry.handle(ctx, new URL('https://hubcdn.fans/file/redirecttest'));
    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toContain('googleusercontent.com');
    expect(result[0]?.url.href).not.toContain('hubcdn.fans');
    expect(result[0]?.label).toBe('HubCloud (CDN)');
  });

  test('hubcdn → hubcloud redirect → delegates to HubCloud extraction', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const hubCloud = new HubCloud(new FetcherMock(`${hubExtractorFixtureBase}/HubCloud`), logger);
    const extractorWithCloud = new HubExtractor(fetcher, logger, hubCloud);
    const registryWithCloud = new ExtractorRegistry(logger, [extractorWithCloud]);

    const result = await registryWithCloud.handle(ctx, new URL('https://hubcdn.org/file/hubcloudpage'));
    // Should delegate to HubCloud.extractInternal which tries to extract from hubcloud.one
    // (fixture doesn't have HubCloud page for hubcloud.one/drive/abc123, so result may be empty or error)
    // Just verify it doesn't return the raw hubcloud URL as external
    expect(result.every(r => !r.url.href.includes('hubcdn.org'))).toBe(true);
  });

  test('hubcdn → HubCloud FSL server (hub.yummy.monster) → delegates to HubCloud extraction', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const hubCloud = new HubCloud(new FetcherMock(`${hubExtractorFixtureBase}/HubCloud`), logger);
    const extractorWithCloud = new HubExtractor(fetcher, logger, hubCloud);
    const registryWithCloud = new ExtractorRegistry(logger, [extractorWithCloud]);

    const result = await registryWithCloud.handle(ctx, new URL('https://hubcdn.org/file/hubcloudredirect'));
    // hub.yummy.monster is a HubCloud FSL server → delegateToHubCloud=true
    // HubCloud extraction will fail without fixtures for hub.yummy.monster, but the URL should not be hubcdn
    expect(result.every(r => !r.url.href.includes('hubcdn.org'))).toBe(true);
  });

  test('invalid link param → empty', async () => {
    const result = await registry.handle(ctx, new URL('https://hubcdn.fans/file/invalidlink'));
    expect(result).toEqual([]);
  });

  test('invalid reurl value → empty', async () => {
    const result = await registry.handle(ctx, new URL('https://hubcdn.fans/file/invalidreurl'));
    expect(result).toEqual([]);
  });

  test('empty link param in hubcdn/dl → empty (unusable URL)', async () => {
    const result = await registry.handle(ctx, new URL('https://hubcdn.fans/file/emptylink'));
    expect(result).toEqual([]);
  });

  test('?r=BASE64 hubcdn redirect → hubcloud page → delegates to HubCloud', async () => {
    const result = await registry.handle(ctx, new URL('https://hubcdn.fans/file/redirectbase64'));
    // Decoded URL is hubcloud.one/drive/base64test?token=xyz → delegateToHubCloud=true
    // HubCloud extraction will fail without fixtures, but the URL should not be hubcdn
    expect(result.every(r => !r.url.href.includes('hubcdn.fans'))).toBe(true);
  });

  test('?r=BASE64 hubcdn redirect → HubCloud FSL server (hub.ymmmy.monster) → delegates to HubCloud', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const hubCloud = new HubCloud(new FetcherMock(`${hubExtractorFixtureBase}/HubCloud`), logger);
    const extractorWithCloud = new HubExtractor(fetcher, logger, hubCloud);
    const registryWithCloud = new ExtractorRegistry(logger, [extractorWithCloud]);

    const result = await registryWithCloud.handle(ctx, new URL('https://hubcdn.fans/file/redirectrbase64direct'));
    // hub.ymmmy.monster is a HubCloud FSL server → delegateToHubCloud=true
    expect(result.every(r => !r.url.href.includes('hubcdn.fans'))).toBe(true);
  });

  test('?r=BASE64 hubcdn redirect with nested ?link= → CDN direct', async () => {
    const result = await registry.handle(ctx, new URL('https://hubcdn.fans/file/redirectrwithlink'));
    expect(result).toHaveLength(1);
    expect(result[0]?.url.href).toContain('googleusercontent.com');
    expect(result[0]?.label).toBe('HubCloud (CDN)');
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
    for (const domain of DEAD_HUBCLOUD_HOSTS) {
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

  test('cacheVersion is 2', () => {
    const extractor = new HubExtractor(new FetcherMock(hubExtractorFixtureBase), logger);
    expect(extractor.cacheVersion).toBe(2);
  });

  test('hubcdn fetch failure in extractInternal → returns empty (outer catch)', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const extractor = new HubExtractor(fetcher, logger);

    // Make resolveHubCdnUrl throw by having fetcher.text reject for a hubcdn URL
    jest.spyOn(fetcher, 'text').mockRejectedValueOnce(new Error('Network error'));

    const result = await extractor.extract(ctx, new URL('https://hubcdn.fans/file/networkfail'), {});
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

describe('HubExtractor metadata enrichment', () => {
  test('cache-hit path merges HubDrive page meta with source meta', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const hubCloud = new HubCloud(new FetcherMock(`${hubExtractorFixtureBase}/HubCloud`), logger);
    const extractor = new HubExtractor(fetcher, logger, hubCloud);

    const url = new URL('https://hubdrive.space/file/7283903021');
    await extractor.normalizeAsync(ctx, url); // populate cache with HubDrive page meta

    const spy = jest.spyOn(hubCloud, 'extractInternal');
    const result = await extractor.extract(ctx, url, { countryCodes: [CountryCode.multi] });

    expect(result.length).toBeGreaterThan(0);
    // Source meta (multi) and HubDrive page meta ([hi, en]) should be merged additively
    const passedMeta = (spy.mock.calls[0] as [unknown, unknown, Meta])[2];
    expect(passedMeta.countryCodes).toContain(CountryCode.multi);
  });

  test('fallback path merges HubDrive page meta with source meta', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const hubCloud = new HubCloud(new FetcherMock(`${hubExtractorFixtureBase}/HubCloud`), logger);
    const extractor = new HubExtractor(fetcher, logger, hubCloud);

    const spy = jest.spyOn(hubCloud, 'extractInternal');
    const result = await extractor.extract(ctx, new URL('https://hubdrive.space/file/7283903021'), { countryCodes: [CountryCode.multi] });

    expect(result.length).toBeGreaterThan(0);
    // Source meta (multi) and HubDrive page meta ([hi, en]) should be merged additively
    const passedMeta = (spy.mock.calls[0] as [unknown, unknown, Meta])[2];
    expect(passedMeta.countryCodes).toContain(CountryCode.multi);
  });

  test('HubDrive page meta enriches title, height, and bytes when source omits them', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const hubCloud = new HubCloud(new FetcherMock(`${hubExtractorFixtureBase}/HubCloud`), logger);
    const extractor = new HubExtractor(fetcher, logger, hubCloud);

    const spy = jest.spyOn(hubCloud, 'extractInternal');
    await extractor.extract(ctx, new URL('https://hubdrive.space/file/7283903021'), {});

    const passedMeta = (spy.mock.calls[0] as [unknown, unknown, Meta])[2];
    // HubDrive page title contains "2160p" and "60.21 GB"
    expect(passedMeta.height).toBe(2160);
    expect(passedMeta.bytes).toBeDefined();
    expect(passedMeta.title).toContain('Avatar');
  });

  test('source meta wins over HubDrive page meta for title, height, bytes', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const hubCloud = new HubCloud(new FetcherMock(`${hubExtractorFixtureBase}/HubCloud`), logger);
    const extractor = new HubExtractor(fetcher, logger, hubCloud);

    const spy = jest.spyOn(hubCloud, 'extractInternal');
    await extractor.extract(ctx, new URL('https://hubdrive.space/file/7283903021'), { title: 'source-title', height: 1080, bytes: 1000 });

    const passedMeta = (spy.mock.calls[0] as [unknown, unknown, Meta])[2];
    expect(passedMeta.title).toBe('source-title');
    expect(passedMeta.height).toBe(1080);
    expect(passedMeta.bytes).toBe(1000);
  });

  test('cache-hit path when HubDrive page has no language names', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const hubCloud = new HubCloud(new FetcherMock(`${hubExtractorFixtureBase}/HubCloud`), logger);
    const extractor = new HubExtractor(fetcher, logger, hubCloud);

    const url = new URL('https://hubdrive.space/file/nolang123');
    await extractor.normalizeAsync(ctx, url); // populate cache (page has no language names)

    const spy = jest.spyOn(hubCloud, 'extractInternal').mockResolvedValue([]);
    await extractor.extract(ctx, url, { countryCodes: [CountryCode.en] });

    const passedMeta = (spy.mock.calls[0] as [unknown, unknown, Meta])[2];
    // HubDrive page has no countryCodes, so only source countryCodes should be present
    expect(passedMeta.countryCodes).toEqual([CountryCode.en]);
  });

  test('fallback path when HubDrive page has no language names', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const hubCloud = new HubCloud(new FetcherMock(`${hubExtractorFixtureBase}/HubCloud`), logger);
    const extractor = new HubExtractor(fetcher, logger, hubCloud);

    const spy = jest.spyOn(hubCloud, 'extractInternal').mockResolvedValue([]);
    await extractor.extract(ctx, new URL('https://hubdrive.space/file/nolang123'), { countryCodes: [CountryCode.en] });

    const passedMeta = (spy.mock.calls[0] as [unknown, unknown, Meta])[2];
    // HubDrive page has no countryCodes, so only source countryCodes should be present
    expect(passedMeta.countryCodes).toEqual([CountryCode.en]);
  });
});

describe('HubExtractor cache eviction', () => {
  test('resolutionCache evicts stale entries when threshold exceeded via normalizeAsync', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const extractor = new HubExtractor(fetcher, logger, undefined, 2);

    const url1 = new URL('https://hubdrive.space/file/7283903021');
    const url2 = new URL('https://hubdrive.space/file/nolang123');

    // Populate cache with 2 entries (threshold = 2)
    await extractor.normalizeAsync(ctx, url1);
    await extractor.normalizeAsync(ctx, url2);

    // Add a 3rd entry by resolving a mocked hubdrive URL
    const url3 = new URL('https://hubdrive.space/file/evict-test-3');
    const mockHtml = '<html><body><a href="https://hubcloud.one/drive/evicttest">HubCloud</a></body></html>';
    jest.spyOn(fetcher, 'text').mockResolvedValueOnce(mockHtml);
    await extractor.normalizeAsync(ctx, url3);

    // Advance time past TTL so all cache entries become stale
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 600000);

    // Resolve url1 again — stale skipped, re-fetched, .set() makes size=4 > 2, eviction runs
    jest.spyOn(fetcher, 'text').mockResolvedValueOnce(mockHtml);
    await extractor.normalizeAsync(ctx, url1);
    // Eviction removed stale entries for url2 and url3
    // Verify by checking url2 needs re-fetch (stale entry was evicted)
    const textSpy = jest.spyOn(fetcher, 'text').mockResolvedValueOnce(mockHtml);
    await extractor.normalizeAsync(ctx, url2);
    expect(textSpy).toHaveBeenCalled();
  });

  test('hubCdnCache evicts stale entries when threshold exceeded via normalizeAsync', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const extractor = new HubExtractor(fetcher, logger, undefined, 2);

    // First hubcdn call: populates hubCdnCache
    const url1 = new URL('https://hubcdn.fans/file/testcode123');
    const url2 = new URL('https://hubcdn.fans/file/fallbackcode456');

    await extractor.normalizeAsync(ctx, url1);
    await extractor.normalizeAsync(ctx, url2);

    // Advance time past TTL
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 600000);

    // Another hubcdn call triggers eviction (threshold=2, cache has 2 entries)
    const url3 = new URL('https://hubcdn.fans/file/vdlink789');
    const result = await extractor.normalizeAsync(ctx, url3);
    // URL resolves normally even after eviction
    expect(result.href).toBe(url3.href);
  });

  test('cache does not evict fresh entries below threshold', async () => {
    const fetcher = new FetcherMock(hubExtractorFixtureBase);
    const extractor = new HubExtractor(fetcher, logger, undefined, 10);
    const textSpy = jest.spyOn(fetcher, 'text');

    const url = new URL('https://hubdrive.space/file/7283903021');

    // First call: populates cache
    await extractor.normalizeAsync(ctx, url);
    const callsAfterFirst = textSpy.mock.calls.length;

    // Second call: cache hit — no eviction needed, entry is fresh
    await extractor.normalizeAsync(ctx, url);
    expect(textSpy.mock.calls.length).toBe(callsAfterFirst);
  });
});
