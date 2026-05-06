import axios from 'axios';
import { ContentType } from 'stremio-addon-sdk';
import winston from 'winston';
import { BlockedError, HttpError, NotFoundError, QueueIsFullError, TimeoutError, TooManyRequestsError, TooManyTimeoutsError } from '../error';
import { createTestContext } from '../test';
import { BlockedReason, CountryCode } from '../types';
import { Fetcher } from '../utils';
import { Source, SourceResult } from './Source';

const ctx = createTestContext();
const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });

class TestSource extends Source {
  public readonly id = 'test';
  public readonly label = 'Test';
  public readonly contentTypes: ContentType[] = ['movie'];
  public readonly countryCodes: CountryCode[] = [CountryCode.en];
  public readonly baseUrl = 'https://test.example';

  public constructor() {
    super();
  }

  public async testProbeBaseUrl(
    ctx: Parameters<Source['probeBaseUrl']>[0],
    fetcher: Parameters<Source['probeBaseUrl']>[1],
    domainKey: Parameters<Source['probeBaseUrl']>[2],
    fallbackCandidates: Parameters<Source['probeBaseUrl']>[3],
  ): Promise<URL> {
    return this.probeBaseUrl(ctx, fetcher, domainKey, fallbackCandidates);
  }

  protected async handleInternal(): Promise<SourceResult[]> {
    return [];
  }
}

describe('Source', () => {
  let fetcher: Fetcher;

  beforeEach(() => {
    fetcher = new Fetcher(axios.create(), logger);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SourceClass = Source as any;
    SourceClass.baseUrlCache = new Map();
    SourceClass.deadDomains = new Map();
    SourceClass.domainsJsonCache = null;
    SourceClass.domainsJsonTs = 0;
  });

  test('stats returns something', async () => {
    const stats = Source.stats();

    expect(stats).toHaveProperty('sourceResultCache');
    expect(stats.sourceResultCache).toBeTruthy();
    expect(stats.domainsJsonAge).toBeNull();
  });

  test('stats returns domainsJsonAge when cache is populated', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SourceClass = Source as any;
    SourceClass.domainsJsonTs = Date.now();

    const stats = Source.stats();
    expect(stats.domainsJsonAge).toBe(0); // Date.now() - Date.now() = 0
  });

  describe('probeBaseUrl', () => {
    test('Tier 0: uses env var override', async () => {
      process.env['TESTSOURCE_BASE_URL'] = 'https://env-override.example';
      try {
        const source = new TestSource();
        const result = await source.testProbeBaseUrl(ctx, fetcher, 'testsource', ['https://fallback.example']);
        expect(result.origin).toBe('https://env-override.example');
      } finally {
        delete process.env['TESTSOURCE_BASE_URL'];
      }
    });

    test('Tier 0: env var with special characters in domain key', async () => {
      process.env['SOME_SPECIAL_KEY_BASE_URL'] = 'https://special.example';
      try {
        const source = new TestSource();
        const result = await source.testProbeBaseUrl(ctx, fetcher, 'some-special-key', ['https://fallback.example']);
        expect(result.origin).toBe('https://special.example');
      } finally {
        delete process.env['SOME_SPECIAL_KEY_BASE_URL'];
      }
    });

    test('Tier 1: uses in-memory cache hit', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SourceClass = Source as any;
      SourceClass.baseUrlCache.set('testsource', { url: 'https://cached.example/', ts: Date.now() });

      const source = new TestSource();
      const result = await source.testProbeBaseUrl(ctx, fetcher, 'testsource', ['https://fallback.example']);
      expect(result.origin).toBe('https://cached.example');
    });

    test('Tier 1: cache miss when TTL expired', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SourceClass = Source as any;
      SourceClass.baseUrlCache.set('testsource', { url: 'https://cached.example/', ts: Date.now() - 999999999 });

      jest.spyOn(fetcher, 'json').mockRejectedValue(new Error('network error'));
      jest.spyOn(fetcher, 'head').mockResolvedValue({});

      const source = new TestSource();
      const result = await source.testProbeBaseUrl(ctx, fetcher, 'testsource', ['https://alive.example']);
      expect(result.origin).toBe('https://alive.example');
    });

    test('Tier 2: uses domains.json when available', async () => {
      jest.spyOn(fetcher, 'json').mockResolvedValue({ testsource: 'https://from-json.example' });

      const source = new TestSource();
      const result = await source.testProbeBaseUrl(ctx, fetcher, 'testsource', ['https://fallback.example']);
      expect(result.origin).toBe('https://from-json.example');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cache = (Source as any).baseUrlCache.get('testsource');
      expect(cache.url).toContain('from-json.example');
    });

    test('Tier 2: returns null from domains.json when key not found', async () => {
      jest.spyOn(fetcher, 'json').mockResolvedValue({ otherkey: 'https://other.example' });
      jest.spyOn(fetcher, 'head').mockResolvedValue({});

      const source = new TestSource();
      const result = await source.testProbeBaseUrl(ctx, fetcher, 'testsource', ['https://alive.example']);
      expect(result.origin).toBe('https://alive.example');
    });

    test('Tier 3: races candidates and picks first alive', async () => {
      jest.spyOn(fetcher, 'json').mockRejectedValue(new Error('network error'));
      jest.spyOn(fetcher, 'head').mockImplementation(async (_ctx, url: URL) => {
        if (url.hostname === 'alive.example') return {};
        throw new TimeoutError(url);
      });

      const source = new TestSource();
      const result = await source.testProbeBaseUrl(ctx, fetcher, 'testsource', [
        'https://dead.example',
        'https://alive.example',
      ]);
      expect(result.origin).toBe('https://alive.example');
    });

    test('Tier 3: throws NotFoundError when all candidates are dead', async () => {
      jest.spyOn(fetcher, 'json').mockRejectedValue(new Error('network error'));
      jest.spyOn(fetcher, 'head').mockImplementation(async (_ctx, url: URL) => {
        throw new TimeoutError(url);
      });

      const source = new TestSource();
      await expect(
        source.testProbeBaseUrl(ctx, fetcher, 'testsource', ['https://dead1.example', 'https://dead2.example']),
      ).rejects.toThrow(NotFoundError);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const deadDomains = (Source as any).deadDomains as Map<string, number>;
      expect(deadDomains.has('dead1.example')).toBe(true);
      expect(deadDomains.has('dead2.example')).toBe(true);
    });

    test('Tier 3: filters out dead domains before racing', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SourceClass = Source as any;
      SourceClass.deadDomains.set('dead.example', Date.now()); // Marked dead within TTL

      jest.spyOn(fetcher, 'json').mockRejectedValue(new Error('network error'));
      jest.spyOn(fetcher, 'head').mockResolvedValue({});

      const source = new TestSource();
      const result = await source.testProbeBaseUrl(ctx, fetcher, 'testsource', [
        'https://dead.example',
        'https://alive.example',
      ]);
      expect(result.origin).toBe('https://alive.example');
    });

    test('Tier 3: uses all candidates as fallback when all are marked dead (expired TTL re-try)', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SourceClass = Source as any;
      SourceClass.deadDomains.set('previously-dead.example', Date.now() - 999999999);

      jest.spyOn(fetcher, 'json').mockRejectedValue(new Error('network error'));
      jest.spyOn(fetcher, 'head').mockResolvedValue({});

      const source = new TestSource();
      const result = await source.testProbeBaseUrl(ctx, fetcher, 'testsource', [
        'https://previously-dead.example',
      ]);
      expect(result.origin).toBe('https://previously-dead.example');
    });

    test('Tier 3: falls back to full candidate list when all are marked dead within TTL', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SourceClass = Source as any;
      SourceClass.deadDomains.set('all-dead.example', Date.now());

      jest.spyOn(fetcher, 'json').mockRejectedValue(new Error('network error'));
      jest.spyOn(fetcher, 'head').mockResolvedValue({});

      const source = new TestSource();
      const result = await source.testProbeBaseUrl(ctx, fetcher, 'testsource', [
        'https://all-dead.example',
      ]);
      expect(result.origin).toBe('https://all-dead.example');
    });
  });

  describe('fetchDomainFromJson', () => {
    test('uses cached JSON when fresh', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SourceClass = Source as any;
      SourceClass.domainsJsonCache = { testsource: 'https://cached-json.example' };
      SourceClass.domainsJsonTs = Date.now();

      const source = new TestSource();
      const result = await source.testProbeBaseUrl(ctx, fetcher, 'testsource', []);
      expect(result.origin).toBe('https://cached-json.example');
    });

    test('returns null from fresh cache when domain key is absent', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SourceClass = Source as any;
      SourceClass.domainsJsonCache = { other: 'https://other.example' };
      SourceClass.domainsJsonTs = Date.now();

      jest.spyOn(fetcher, 'head').mockResolvedValue({});

      const source = new TestSource();
      const result = await source.testProbeBaseUrl(ctx, fetcher, 'testsource', ['https://alive.example']);
      expect(result.origin).toBe('https://alive.example');
    });

    test('fetches fresh JSON from GitHub when cache expired', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SourceClass = Source as any;
      SourceClass.domainsJsonCache = { other: 'https://old.example' };
      SourceClass.domainsJsonTs = Date.now() - 999999999; // Expired

      jest.spyOn(fetcher, 'json').mockResolvedValue({ testsource: 'https://fresh-json.example' });

      const source = new TestSource();
      const result = await source.testProbeBaseUrl(ctx, fetcher, 'testsource', []);
      expect(result.origin).toBe('https://fresh-json.example');
    });

    test('uses stale cache on GitHub fetch failure', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SourceClass = Source as any;
      SourceClass.domainsJsonCache = { testsource: 'https://stale.example' };
      SourceClass.domainsJsonTs = Date.now() - 999999999; // Expired

      jest.spyOn(fetcher, 'json').mockRejectedValue(new Error('network error'));

      const source = new TestSource();
      const result = await source.testProbeBaseUrl(ctx, fetcher, 'testsource', ['https://fallback.example']);
      expect(result.origin).toBe('https://stale.example');
    });

    test('returns null when no cache and GitHub fetch fails', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SourceClass = Source as any;
      SourceClass.domainsJsonCache = null;
      SourceClass.domainsJsonTs = 0;

      jest.spyOn(fetcher, 'json').mockRejectedValue(new Error('network error'));
      jest.spyOn(fetcher, 'head').mockResolvedValue({});

      const source = new TestSource();
      const result = await source.testProbeBaseUrl(ctx, fetcher, 'testsource', ['https://alive.example']);
      expect(result.origin).toBe('https://alive.example');
    });

    test('returns null when stale cache does not contain the domain key', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SourceClass = Source as any;
      SourceClass.domainsJsonCache = { other: 'https://other.example' };
      SourceClass.domainsJsonTs = Date.now() - 999999999; // Expired

      jest.spyOn(fetcher, 'json').mockRejectedValue(new Error('network error'));
      jest.spyOn(fetcher, 'head').mockResolvedValue({});

      const source = new TestSource();
      const result = await source.testProbeBaseUrl(ctx, fetcher, 'testsource', ['https://alive.example']);
      expect(result.origin).toBe('https://alive.example');
    });
  });

  describe('isDomainAlive', () => {
    test('returns true for successful HEAD request', async () => {
      jest.spyOn(fetcher, 'json').mockRejectedValue(new Error('network error'));
      jest.spyOn(fetcher, 'head').mockResolvedValue({});

      const source = new TestSource();
      const result = await source.testProbeBaseUrl(ctx, fetcher, 'testsource', ['https://alive.example']);
      expect(result.origin).toBe('https://alive.example');
    });

    test('returns true for BlockedError (CF-protected domain is alive)', async () => {
      jest.spyOn(fetcher, 'json').mockRejectedValue(new Error('network error'));
      jest.spyOn(fetcher, 'head').mockImplementation(async (_ctx, url: URL) => {
        throw new BlockedError(url, BlockedReason.cloudflare_challenge, {});
      });

      const source = new TestSource();
      const result = await source.testProbeBaseUrl(ctx, fetcher, 'testsource', ['https://cf-protected.example']);
      expect(result.origin).toBe('https://cf-protected.example');
    });

    test('returns true for NotFoundError (server responded, just 404)', async () => {
      jest.spyOn(fetcher, 'json').mockRejectedValue(new Error('network error'));
      jest.spyOn(fetcher, 'head').mockImplementation(async () => {
        throw new NotFoundError();
      });

      const source = new TestSource();
      const result = await source.testProbeBaseUrl(ctx, fetcher, 'testsource', ['https://notfound.example']);
      expect(result.origin).toBe('https://notfound.example');
    });

    test('returns true for HttpError (server responded with error status)', async () => {
      jest.spyOn(fetcher, 'json').mockRejectedValue(new Error('network error'));
      jest.spyOn(fetcher, 'head').mockImplementation(async (_ctx, url: URL) => {
        throw new HttpError(url, 500, 'Internal Server Error', {});
      });

      const source = new TestSource();
      const result = await source.testProbeBaseUrl(ctx, fetcher, 'testsource', ['https://httperror.example']);
      expect(result.origin).toBe('https://httperror.example');
    });

    test('returns true for TooManyRequestsError (429 = alive)', async () => {
      jest.spyOn(fetcher, 'json').mockRejectedValue(new Error('network error'));
      jest.spyOn(fetcher, 'head').mockImplementation(async (_ctx, url: URL) => {
        throw new TooManyRequestsError(url, 60);
      });

      const source = new TestSource();
      const result = await source.testProbeBaseUrl(ctx, fetcher, 'testsource', ['https://ratelimited.example']);
      expect(result.origin).toBe('https://ratelimited.example');
    });

    test('returns true for TooManyTimeoutsError (server exists, just slow)', async () => {
      jest.spyOn(fetcher, 'json').mockRejectedValue(new Error('network error'));
      jest.spyOn(fetcher, 'head').mockImplementation(async (_ctx, url: URL) => {
        throw new TooManyTimeoutsError(url);
      });

      const source = new TestSource();
      const result = await source.testProbeBaseUrl(ctx, fetcher, 'testsource', ['https://slow.example']);
      expect(result.origin).toBe('https://slow.example');
    });

    test('returns false for TimeoutError (DNS failure / connection refused)', async () => {
      jest.spyOn(fetcher, 'json').mockRejectedValue(new Error('network error'));
      jest.spyOn(fetcher, 'head').mockImplementation(async (_ctx, url: URL) => {
        throw new TimeoutError(url);
      });

      const source = new TestSource();
      await expect(
        source.testProbeBaseUrl(ctx, fetcher, 'testsource', ['https://timeout.example']),
      ).rejects.toThrow(NotFoundError);
    });

    test('returns false for QueueIsFullError', async () => {
      jest.spyOn(fetcher, 'json').mockRejectedValue(new Error('network error'));
      jest.spyOn(fetcher, 'head').mockImplementation(async (_ctx, url: URL) => {
        throw new QueueIsFullError(url);
      });

      const source = new TestSource();
      await expect(
        source.testProbeBaseUrl(ctx, fetcher, 'testsource', ['https://queuefull.example']),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
