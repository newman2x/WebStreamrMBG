import axios from 'axios';
import winston from 'winston';
import { createTestContext } from '../test';
import { Fetcher, FetcherMock, ImdbId } from '../utils';
import { HDHub4u } from './HDHub4u';
import { Source } from './Source';

const ctx = createTestContext();
const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });

describe('HDHub4u', () => {
  let source: HDHub4u;

  beforeEach(() => {
    source = new HDHub4u(new FetcherMock(`${__dirname}/__fixtures__/HDHub4u`));
  });

  test('handle superman 2025', async () => {
    const streams = await source.handle(ctx, 'movie', new ImdbId('tt5950044', undefined, undefined));
    expect(streams).toMatchSnapshot();
  });

  test('handle the bone temple 2026', async () => {
    const streams = await source.handle(ctx, 'movie', new ImdbId('tt32141377', undefined, undefined));
    expect(streams).toMatchSnapshot();
  });

  test('handle stranger things s05e01', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt4574334', 5, 1));
    expect(streams).toMatchSnapshot();
  });

  test('handle stranger things s05e08', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt4574334', 5, 8));
    expect(streams).toMatchSnapshot();
  });
});

describe('HDHub4u search fallback', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SourceClass = Source as any;
    SourceClass.baseUrlCache = new Map();
    SourceClass.deadDomains = new Map();
    SourceClass.domainsJsonCache = null;
    SourceClass.domainsJsonTs = 0;
  });

  test('falls back to site search when pingora returns no hits', async () => {
    const fetcher = new Fetcher(axios.create(), logger);
    const source = new HDHub4u(fetcher);

    const imdbId = new ImdbId('tt1234567', undefined, undefined);

    jest.spyOn(fetcher, 'json').mockImplementation(async (_ctx, url: URL) => {
      if (url.href.includes('pingora')) return { hits: [] };
      if (url.href.includes('themoviedb')) return { movie_results: [{ id: 123, title: 'Test', release_date: '2024-01-01' }] };
      return {};
    });
    jest.spyOn(fetcher, 'text').mockImplementation(async (_ctx, url: URL) => {
      if (url.href.includes('s=tt1234567')) {
        return `<html><body>
          <a href="https://new1.hdhub4u.fo/movie-test-tt1234567">Movie Test tt1234567</a>
          <a href="https://other.site/irrelevant">Other</a>
        </body></html>`;
      }
      return '<html><body></body></html>';
    });
    jest.spyOn(fetcher, 'head').mockResolvedValue({});

    const result = await source.handle(ctx, 'movie', imdbId);
    expect(result).toEqual([]);
  });

  test('falls back to site search when pingora throws', async () => {
    const fetcher = new Fetcher(axios.create(), logger);
    const source = new HDHub4u(fetcher);

    const imdbId = new ImdbId('tt9999999', undefined, undefined);

    jest.spyOn(fetcher, 'json').mockImplementation(async (_ctx, url: URL) => {
      if (url.href.includes('pingora')) throw new Error('network error');
      if (url.href.includes('themoviedb')) return { movie_results: [{ id: 999, title: 'Test', release_date: '2024-01-01' }] };
      return {};
    });
    jest.spyOn(fetcher, 'text').mockImplementation(async (_ctx, url: URL) => {
      if (url.href.includes('s=tt9999999')) {
        return `<html><body>
          <a href="https://new1.hdhub4u.fo/movie-tt9999999">Test Movie tt9999999</a>
        </body></html>`;
      }
      return '<html><body></body></html>';
    });
    jest.spyOn(fetcher, 'head').mockResolvedValue({});

    const result = await source.handle(ctx, 'movie', imdbId);
    expect(result).toEqual([]);
  });

  test('returns empty when both pingora and site search fail', async () => {
    const fetcher = new Fetcher(axios.create(), logger);
    const source = new HDHub4u(fetcher);

    const imdbId = new ImdbId('tt0000000', undefined, undefined);

    jest.spyOn(fetcher, 'json').mockImplementation(async (_ctx, url: URL) => {
      if (url.href.includes('pingora')) throw new Error('network error');
      if (url.href.includes('themoviedb')) return { movie_results: [{ id: 0, title: 'Test', release_date: '2024-01-01' }] };
      return {};
    });
    jest.spyOn(fetcher, 'text').mockRejectedValue(new Error('network error'));
    jest.spyOn(fetcher, 'head').mockResolvedValue({});

    const result = await source.handle(ctx, 'movie', imdbId);
    expect(result).toEqual([]);
  });

  test('site search finds matching link by text content', async () => {
    const fetcher = new Fetcher(axios.create(), logger);
    const source = new HDHub4u(fetcher);

    const imdbId = new ImdbId('tt5555555', undefined, undefined);

    jest.spyOn(fetcher, 'json').mockImplementation(async (_ctx, url: URL) => {
      if (url.href.includes('pingora')) return { hits: [] };
      if (url.href.includes('themoviedb')) return { movie_results: [{ id: 555, title: 'Test', release_date: '2024-01-01' }] };
      return {};
    });
    jest.spyOn(fetcher, 'text').mockImplementation(async (_ctx, url: URL) => {
      if (url.href.includes('s=tt5555555')) {
        return `<html><body>
          <a href="https://new1.hdhub4u.fo/some-movie">Some Movie tt5555555 Download</a>
          <a href="https://other.site/irrelevant">Other Site</a>
          <a href="https://new1.hdhub4u.fo/unrelated">Unrelated Page</a>
          <a>Link without href</a>
        </body></html>`;
      }
      return '<html><body></body></html>';
    });
    jest.spyOn(fetcher, 'head').mockResolvedValue({});

    const result = await source.handle(ctx, 'movie', imdbId);
    expect(result).toEqual([]);
  });
});
