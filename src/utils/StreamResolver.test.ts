import { ContentType } from 'stremio-addon-sdk';
import winston from 'winston';
import { BlockedError, HttpError, NotFoundError, QueueIsFullError, TimeoutError, TooManyRequestsError, TooManyTimeoutsError } from '../error';
import { createExtractors, Extractor, ExtractorRegistry } from '../extractor';
import { HubCloud } from '../extractor/HubCloud';
import { RgShows as RgShowsExtractor } from '../extractor/RgShows';
import { Source, SourceResult } from '../source';
import { FourKHDHub } from '../source/FourKHDHub';
import { MeineCloud } from '../source/MeineCloud';
import { MostraGuarda } from '../source/MostraGuarda';
import { RgShows } from '../source/RgShows';
import { createTestContext } from '../test';
import { BlockedReason, CountryCode, Format, Meta, UrlResult } from '../types';
import { FetcherMock } from './FetcherMock';
import { ImdbId, TmdbId } from './id';
import { StreamResolver } from './StreamResolver';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const fetcher = new FetcherMock(`${__dirname}/__fixtures__/StreamResolver`);
const ctx = createTestContext({ de: 'on', it: 'on' });

const fourKhdHub = new FourKHDHub(fetcher);
const meineCloud = new MeineCloud(fetcher);
const mostraGuarda = new MostraGuarda(fetcher);

describe('resolve', () => {
  test('returns info as stream if no sources were configured', async () => {
    const streamResolver = new StreamResolver(logger, new ExtractorRegistry(logger, createExtractors(fetcher, logger)));

    const streams = await streamResolver.resolve(ctx, [], 'movie', new ImdbId('tt123456789', undefined, undefined));

    expect(streams).toMatchSnapshot();
  });

  test('returns source errors as stream', async () => {
    const fetcherSpy = jest.spyOn(fetcher, 'text').mockRejectedValue('ups, an error occurred.');
    const streamResolver = new StreamResolver(logger, new ExtractorRegistry(logger, createExtractors(fetcher, logger)));

    const streams = await streamResolver.resolve(ctx, [meineCloud], 'movie', new ImdbId('tt123456789', undefined, undefined));
    expect(streams).toMatchSnapshot();

    const streamsWithShowErrors = await streamResolver.resolve({ ...ctx, config: { ...ctx.config, showErrors: 'on' } }, [meineCloud], 'movie', new ImdbId('tt123456789', undefined, undefined));
    expect(streamsWithShowErrors).toMatchSnapshot();

    fetcherSpy.mockRestore();
  });

  test('returns empty array if no source found anything', async () => {
    const streamResolver = new StreamResolver(logger, new ExtractorRegistry(logger, createExtractors(fetcher, logger)));

    const streams = await streamResolver.resolve(ctx, [meineCloud, mostraGuarda], 'movie', new ImdbId('tt12345678', undefined, undefined));

    expect(streams).toMatchSnapshot();
  });

  test('returns empty array if no source supported the type', async () => {
    const streamResolver = new StreamResolver(logger, new ExtractorRegistry(logger, createExtractors(fetcher, logger)));

    const streams = await streamResolver.resolve(ctx, [meineCloud, mostraGuarda], 'series', new ImdbId('tt12345678', 1, 1));

    expect(streams).toMatchSnapshot();
  });

  test('returns sorted results', async () => {
    const streamResolver = new StreamResolver(logger, new ExtractorRegistry(logger, createExtractors(fetcher, logger)));

    const streams = await streamResolver.resolve(ctx, [meineCloud, mostraGuarda], 'movie', new ImdbId('tt29141112', undefined, undefined));
    expect(streams.ttl).not.toBeUndefined();
    expect(streams.streams).toMatchSnapshot();

    const streamsWithExternalUrls = await streamResolver.resolve({ ...ctx, config: { ...ctx.config, includeExternalUrls: 'on' } }, [meineCloud, mostraGuarda], 'movie', new ImdbId('tt29141112', undefined, undefined));
    expect(streamsWithExternalUrls.ttl).not.toBeUndefined();
    expect(streamsWithExternalUrls.streams).toMatchSnapshot();
  });

  test('skips fallback sources if possible', async () => {
    const streamResolver = new StreamResolver(logger, new ExtractorRegistry(logger, [new HubCloud(fetcher, logger), new RgShowsExtractor(fetcher, logger)]));

    const streams = await streamResolver.resolve(createTestContext(), [fourKhdHub, new RgShows(fetcher)], 'movie', new TmdbId(812583, undefined, undefined));
    expect(streams.streams).toMatchSnapshot();
  });

  test('keeps fallback sources if needed', async () => {
    const streamResolver = new StreamResolver(logger, new ExtractorRegistry(logger, [new HubCloud(fetcher, logger), new RgShowsExtractor(fetcher, logger)]));

    const streams = await streamResolver.resolve(createTestContext(), [new RgShows(fetcher)], 'movie', new TmdbId(812583, undefined, undefined));
    expect(streams.streams).toMatchSnapshot();
  });

  test('uses priority for sorting', async () => {
    class HighPrioritySource extends Source {
      public readonly id = 'high-priority';
      public readonly label = 'HighPriority';
      public readonly contentTypes: ContentType[] = ['series'];
      public readonly countryCodes: CountryCode[] = [CountryCode.multi];
      public override readonly priority = 2;
      public readonly baseUrl = 'https://high.example';
      public readonly handleInternal = async (): Promise<SourceResult[]> => {
        return [{ url: new URL('https://high.example/file'), meta: { countryCodes: [CountryCode.multi], height: 1080 } }];
      };
    }

    class LowPrioritySource extends Source {
      public readonly id = 'low-priority';
      public readonly label = 'LowPriority';
      public readonly contentTypes: ContentType[] = ['series'];
      public readonly countryCodes: CountryCode[] = [CountryCode.multi];
      public override readonly priority = 1;
      public readonly baseUrl = 'https://low.example';
      public readonly handleInternal = async (): Promise<SourceResult[]> => {
        return [{ url: new URL('https://low.example/file'), meta: { countryCodes: [CountryCode.multi], height: 1080 } }];
      };
    }

    class PassThroughExtractor extends Extractor {
      public readonly id = 'passthrough';
      public readonly label = 'PassThrough';
      public readonly supports = (): boolean => true;
      protected readonly extractInternal = async (_ctx: unknown, url: URL, meta: Meta): Promise<UrlResult[]> => {
        return [{ url, format: Format.unknown, label: meta.sourceLabel ?? 'PassThrough', ttl: 300000, meta }];
      };
    }

    const streamResolver = new StreamResolver(logger, new ExtractorRegistry(logger, [new PassThroughExtractor(fetcher, logger)]));
    const result = await streamResolver.resolve(createTestContext(), [new LowPrioritySource(), new HighPrioritySource()], 'series', new TmdbId(2190, 26, 2));

    // HighPriority (priority=2) should come before LowPriority (priority=1)
    const titles = result.streams.map(s => s.title);
    const highIdx = titles.findIndex(t => t?.includes('HighPriority'));
    const lowIdx = titles.findIndex(t => t?.includes('LowPriority'));
    expect(highIdx).toBeLessThan(lowIdx);
  });

  test('adds error info', async () => {
    class MockSource extends Source {
      public readonly id = 'mocksource';

      public readonly label = 'MockSource';

      public readonly contentTypes: ContentType[] = ['movie'];

      public readonly countryCodes: CountryCode[] = [CountryCode.de];

      public readonly baseUrl = 'https://example.com';

      public readonly handleInternal = async (): Promise<SourceResult[]> => {
        return [{ url: new URL('https://example.com'), meta: { countryCodes: [CountryCode.de] } }];
      };
    }

    class MockExtractor extends Extractor {
      public readonly id = 'mockextractor';

      public readonly label = 'MockExtractor';

      public override readonly ttl = 1;

      public readonly supports = (): boolean => true;

      protected readonly extractInternal = async (): Promise<UrlResult[]> =>
        [
          {
            url: new URL('https://example1.com'),
            format: Format.unknown,
            isExternal: true,
            label: 'hoster.com',
            ttl: this.ttl,
            meta: {
              countryCodes: [CountryCode.de],
            },
          },
          {
            url: new URL('https://example2.com'),
            format: Format.unknown,
            isExternal: true,
            error: new BlockedError(new URL('https://example2.com'), BlockedReason.cloudflare_challenge, {}),
            label: 'hoster.com',
            ttl: this.ttl,
            meta: {
              countryCodes: [CountryCode.de],
            },
          },
          {
            url: new URL('https://example3.com'),
            format: Format.unknown,
            isExternal: true,
            error: new BlockedError(new URL('https://example3.com'), BlockedReason.cloudflare_censor, {}),
            label: 'hoster.com',
            ttl: this.ttl,
            meta: {
              countryCodes: [CountryCode.de],
            },
          },
          {
            url: new URL('https://example4.com'),
            format: Format.unknown,
            isExternal: true,
            error: new BlockedError(new URL('https://example4.com'), BlockedReason.media_flow_proxy_auth, {}),
            label: 'hoster.com',
            ttl: this.ttl,
            meta: {
              countryCodes: [CountryCode.de],
            },
          },
          {
            url: new URL('https://example5.com'),
            format: Format.unknown,
            isExternal: true,
            error: new BlockedError(new URL('https://example5.com'), BlockedReason.unknown, {}),
            label: 'hoster.com',
            ttl: this.ttl,
            meta: {
              countryCodes: [CountryCode.de],
            },
          },
          {
            url: new URL('https://example6.com'),
            format: Format.unknown,
            label: 'working1',
            ttl: this.ttl,
            meta: {
              countryCodes: [CountryCode.de],
            },
          },
          {
            url: new URL('https://example7.com'),
            format: Format.unknown,
            isExternal: true,
            error: new TooManyRequestsError(new URL('https://example7.com'), 10),
            label: 'hoster.com',
            ttl: this.ttl,
            meta: {
              countryCodes: [CountryCode.de],
            },
          },
          {
            url: new URL('https://example8.com'),
            format: Format.unknown,
            isExternal: true,
            error: new TooManyTimeoutsError(new URL('https://example8.com')),
            label: 'hoster.com',
            ttl: this.ttl,
            meta: {
              countryCodes: [CountryCode.de],
            },
          },
          {
            url: new URL('https://example9.com'),
            format: Format.unknown,
            label: 'working2',
            ttl: this.ttl,
            meta: {
              countryCodes: [CountryCode.de],
            },
          },
          {
            url: new URL('https://example10.com'),
            format: Format.unknown,
            isExternal: true,
            error: new TypeError(),
            label: 'hoster.com',
            ttl: this.ttl,
            meta: {
              countryCodes: [CountryCode.de],
            },
          },
          {
            url: new URL('https://example11.com'),
            format: Format.unknown,
            isExternal: true,
            error: new TimeoutError(new URL('https://example11.com')),
            label: 'hoster.com',
            ttl: this.ttl,
            meta: {
              countryCodes: [CountryCode.de],
            },
          },
          {
            url: new URL('https://example12.com'),
            format: Format.unknown,
            isExternal: true,
            error: new QueueIsFullError(new URL('https://example12.com')),
            label: 'hoster.com',
            ttl: this.ttl,
            meta: {
              countryCodes: [CountryCode.de],
            },
          },
          {
            url: new URL('https://example13.com'),
            format: Format.unknown,
            isExternal: true,
            error: new HttpError(new URL('https://example13.com'), 500, 'Internal Server Error', { 'x-foo': 'bar' }),
            label: 'hoster.com',
            ttl: this.ttl,
            meta: {
              countryCodes: [CountryCode.de],
            },
          },
          {
            url: new URL('https://example14.com'),
            format: Format.unknown,
            isExternal: true,
            error: new HttpError(new URL('https://example14.com'), 418, 'I\'m a tea pot', { 'x-foo': 'bar' }),
            label: 'hoster.com',
            ttl: this.ttl,
            meta: {
              countryCodes: [CountryCode.de],
            },
          },
        ];
    }

    const streamResolver = new StreamResolver(logger, new ExtractorRegistry(logger, [new MockExtractor(fetcher, logger)]));

    const streams = await streamResolver.resolve(ctx, [new MockSource()], 'movie', new ImdbId('tt11655566', undefined, undefined));
    expect(streams).toMatchSnapshot();

    const streamsWithShowErrors = await streamResolver.resolve({ ...ctx, config: { ...ctx.config, showErrors: 'on' } }, [new MockSource()], 'movie', new ImdbId('tt11655566', undefined, undefined));
    expect(streamsWithShowErrors).toMatchSnapshot();
  });

  test('ignores not found errors', async () => {
    class MockSource extends Source {
      public readonly id = 'mocksource';

      public readonly label = 'MockSource';

      public readonly contentTypes: ContentType[] = ['movie'];

      public readonly countryCodes: CountryCode[] = [CountryCode.de];

      public readonly baseUrl = 'https://example.com';

      public readonly handleInternal = async (): Promise<SourceResult[]> => {
        throw new NotFoundError();
      };
    }

    const streamResolver = new StreamResolver(logger, new ExtractorRegistry(logger, createExtractors(fetcher, logger)));

    const streams = await streamResolver.resolve(ctx, [new MockSource()], 'movie', new ImdbId('tt12345678', undefined, undefined));

    expect(streams).toMatchSnapshot();
  });
});

test('handles source throwing non-NotFoundError', async () => {
  class ThrowingSource extends Source {
    public readonly id = 'throwingsource';
    public readonly label = 'ThrowingSource';
    public readonly contentTypes: ContentType[] = ['movie'];
    public readonly countryCodes: CountryCode[] = [CountryCode.de];
    public readonly baseUrl = 'https://example.com';
    public readonly handleInternal = async (): Promise<SourceResult[]> => {
      throw new Error('boom');
    };
  }

  const streamResolver = new StreamResolver(logger, new ExtractorRegistry(logger, createExtractors(fetcher, logger)));

  const streams = await streamResolver.resolve(ctx, [new ThrowingSource()], 'movie', new ImdbId('tt12345678', undefined, undefined));
  expect(streams).toMatchSnapshot();

  const streamsWithShowErrors = await streamResolver.resolve({ ...ctx, config: { ...ctx.config, showErrors: 'on' } }, [new ThrowingSource()], 'movie', new ImdbId('tt12345678', undefined, undefined));
  expect(streamsWithShowErrors).toMatchSnapshot();
});

test('skips fallback source when enough results already found', async () => {
  class PrimarySource extends Source {
    public readonly id = 'primary';
    public readonly label = 'Primary';
    public readonly contentTypes: ContentType[] = ['movie'];
    public readonly countryCodes: CountryCode[] = [CountryCode.de];
    public readonly baseUrl = 'https://example.com';
    public readonly handleInternal = async (): Promise<SourceResult[]> => {
      return [
        { url: new URL('https://example.com/1'), meta: { countryCodes: [CountryCode.de] } },
        { url: new URL('https://example.com/2'), meta: { countryCodes: [CountryCode.de] } },
      ];
    };
  }

  class FallbackSource extends Source {
    public readonly id = 'fallback';
    public readonly label = 'Fallback';
    public readonly contentTypes: ContentType[] = ['movie'];
    public readonly countryCodes: CountryCode[] = [CountryCode.de];
    public override readonly useOnlyWithMaxUrlsFound = 1;
    public readonly baseUrl = 'https://fallback.com';
    public readonly handleInternal = async (): Promise<SourceResult[]> => {
      return [{ url: new URL('https://fallback.com/1'), meta: { countryCodes: [CountryCode.de] } }];
    };
  }

  class PassThroughExtractor extends Extractor {
    public readonly id = 'passthrough';
    public readonly label = 'PassThrough';
    public readonly supports = (): boolean => true;
    protected readonly extractInternal = async (_ctx: unknown, url: URL, meta: Meta): Promise<UrlResult[]> => {
      return [{ url, format: Format.unknown, label: 'PassThrough', ttl: 300000, meta }];
    };
  }

  const streamResolver = new StreamResolver(logger, new ExtractorRegistry(logger, [new PassThroughExtractor(fetcher, logger)]));
  const streams = await streamResolver.resolve(ctx, [new PrimarySource(), new FallbackSource()], 'movie', new ImdbId('tt99887766', undefined, undefined));

  expect(streams.streams.every(s => !s.name?.includes('Fallback'))).toBe(true);
});

test('sorts by label when priority is equal', async () => {
  class SourceA extends Source {
    public readonly id = 'source-a';
    public readonly label = 'AlphaSource';
    public readonly contentTypes: ContentType[] = ['movie'];
    public readonly countryCodes: CountryCode[] = [CountryCode.de];
    public readonly baseUrl = 'https://alpha.example';
    public readonly handleInternal = async (): Promise<SourceResult[]> => {
      return [{ url: new URL('https://alpha.example/file'), meta: { countryCodes: [CountryCode.de], height: 1080 } }];
    };
  }

  class SourceB extends Source {
    public readonly id = 'source-b';
    public readonly label = 'BetaSource';
    public readonly contentTypes: ContentType[] = ['movie'];
    public readonly countryCodes: CountryCode[] = [CountryCode.de];
    public readonly baseUrl = 'https://beta.example';
    public readonly handleInternal = async (): Promise<SourceResult[]> => {
      return [{ url: new URL('https://beta.example/file'), meta: { countryCodes: [CountryCode.de], height: 1080 } }];
    };
  }

  class PassThroughExtractor extends Extractor {
    public readonly id = 'passthrough';
    public readonly label = 'PassThrough';
    public readonly supports = (): boolean => true;
    protected readonly extractInternal = async (_ctx: unknown, url: URL, meta: Meta): Promise<UrlResult[]> => {
      return [{ url, format: Format.unknown, label: meta.sourceLabel ?? 'PassThrough', ttl: 300000, meta }];
    };
  }

  const streamResolver = new StreamResolver(logger, new ExtractorRegistry(logger, [new PassThroughExtractor(fetcher, logger)]));
  const result = await streamResolver.resolve(ctx, [new SourceB(), new SourceA()], 'movie', new ImdbId('tt55667788', undefined, undefined));

  // Both have priority 0, same height — should be sorted by label alphabetically
  const labels = result.streams.map(s => s.title);
  const alphaIdx = labels.findIndex(t => t?.includes('AlphaSource'));
  const betaIdx = labels.findIndex(t => t?.includes('BetaSource'));
  expect(alphaIdx).toBeLessThan(betaIdx);
});
