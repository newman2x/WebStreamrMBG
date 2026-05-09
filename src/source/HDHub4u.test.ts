import axios from 'axios';
import winston from 'winston';
import { createTestContext } from '../test';
import { CountryCode } from '../types';
import { Fetcher, FetcherMock, ImdbId } from '../utils';
import { resolveRedirectUrl } from './hd-hub-helper';
import { HDHub4u, resetCdnCache } from './HDHub4u';
import { Source } from './Source';

jest.mock('./hd-hub-helper', () => ({
  resolveRedirectUrl: jest.fn(),
}));

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

describe('HDHub4u internal methods', () => {
  let source: HDHub4u;
  let fetcher: Fetcher;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SourceClass = Source as any;
    SourceClass.baseUrlCache = new Map();
    SourceClass.deadDomains = new Map();
    SourceClass.domainsJsonCache = null;
    SourceClass.domainsJsonTs = 0;

    resetCdnCache();

    fetcher = new Fetcher(axios.create(), logger);
    source = new HDHub4u(fetcher);
  });

  test('extractHubDriveUrlResults finds hub drive links', () => {
    const html = `<html><body>
      <a href="https://hubdrive.dad/file/123">HubDrive Link</a>
      <a href="https://hubcloud.foo/drive/abc">HubCloud Link</a>
      <a href="https://example.com/other">Other</a>
      <a>No href attribute</a>
    </body></html>`;
    const results = source['extractHubDriveUrlResults'](html, { countryCodes: [CountryCode.multi] });
    expect(results).toHaveLength(2);
    expect(results.some(r => r.url.href.includes('hubdrive'))).toBe(true);
    expect(results.some(r => r.url.href.includes('hubcloud'))).toBe(true);
  });

  test('extractHubDriveUrlResults excludes dead domains', () => {
    const html = `<html><body>
      <a href="https://hubcloud.ink/drive/abc">Dead Domain</a>
      <a href="https://hubcloud.foo/drive/xyz">Live Domain</a>
    </body></html>`;
    const results = source['extractHubDriveUrlResults'](html, { countryCodes: [CountryCode.multi] });
    expect(results).toHaveLength(1);
    expect(results.some(r => r.url.href.includes('hubcloud.foo'))).toBe(true);
  });

  test('extractHubDriveUrlResults excludes patterns and lightning bolt links', () => {
    const html = `<html><body>
      <a href="https://hubdrive.dad/file/123">⚡ Fast</a>
      <a href="https://gadgetsweb.xyz/id=abc">GadgetsWeb</a>
      <a href="https://hubdrive.dad/file/456">Normal Link</a>
    </body></html>`;
    const results = source['extractHubDriveUrlResults'](html, { countryCodes: [CountryCode.multi] });
    expect(results).toHaveLength(1);
    expect(results.some(r => r.url.href.includes('456'))).toBe(true);
  });

  test('extractHubDriveUrlResults skips invalid URLs', () => {
    const html = `<html><body>
      <a href="https://hubdrive.dad/file/123">Valid</a>
      <a href="https://hubdrive.dad:invalid/file">Invalid Port</a>
    </body></html>`;
    const results = source['extractHubDriveUrlResults'](html, { countryCodes: [CountryCode.multi] });
    expect(results).toHaveLength(1);
    expect(results.some(r => r.url.href.includes('hubdrive.dad/file/123'))).toBe(true);
  });

  test('handlePage for movie extracts hub links', async () => {
    const pageUrl = new URL('https://new6.hdhub4u.fo/superman-2025');
    const imdbId = new ImdbId('tt5950044', undefined, undefined);

    jest.spyOn(fetcher, 'text').mockResolvedValue(`<html><body>
      <div>Language: Hindi</div>
      <a href="https://hubdrive.dad/file/123">HubDrive</a>
      <a href="https://hubcloud.foo/drive/abc">HubCloud</a>
      <a href="https://gadgetsweb.xyz/?id=testid">GadgetWeb Link</a>
    </body></html>`);

    (resolveRedirectUrl as jest.Mock).mockResolvedValue(new URL('https://hubdrive.dad/file/999'));

    const results = await source['handlePage'](ctx, pageUrl, imdbId);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  test('handlePage for series extracts episode links', async () => {
    const pageUrl = new URL('https://new6.hdhub4u.fo/stranger-things');
    const imdbId = new ImdbId('tt4574334', 5, 1);

    jest.spyOn(fetcher, 'text').mockResolvedValue(`<html><body>
      <div>Language: English</div>
      <h4>EPiSODE 1 - Chapter One</h4>
      <a href="https://hubdrive.dad/file/999">HubDrive Ep1</a>
      <hr>
    </body></html>`);

    const results = await source['handlePage'](ctx, pageUrl, imdbId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  test('handleHubLinks returns hub URL when redirect resolves to hub host', async () => {
    const redirectUrl = new URL('https://gadgetsweb.xyz/id=abc');
    const refererUrl = new URL('https://new6.hdhub4u.fo/superman');
    const meta = { countryCodes: [CountryCode.multi] };

    (resolveRedirectUrl as jest.Mock).mockResolvedValue(new URL('https://hubdrive.dad/file/123'));

    const results = await source['handleHubLinks'](ctx, redirectUrl, refererUrl, meta);
    expect(results).toHaveLength(1);
    expect(results.some(r => r.url.href.includes('hubdrive.dad'))).toBe(true);
    expect(results.every(r => r.meta.referer === refererUrl.href)).toBe(true);
  });

  test('handleHubLinks fetches page when redirect resolves to non-hub host', async () => {
    const redirectUrl = new URL('https://gadgetsweb.xyz/id=abc');
    const refererUrl = new URL('https://new6.hdhub4u.fo/superman');
    const meta = { countryCodes: [CountryCode.multi] };

    (resolveRedirectUrl as jest.Mock).mockResolvedValue(new URL('https://hblinks.dad/archives/123'));

    jest.spyOn(fetcher, 'text').mockResolvedValue(`<html><body>
      <a href="https://hubdrive.dad/file/456">HubDrive</a>
    </body></html>`);

    const results = await source['handleHubLinks'](ctx, redirectUrl, refererUrl, meta);
    expect(results).toHaveLength(1);
    expect(results.some(r => r.url.href.includes('hubdrive.dad'))).toBe(true);
    expect(results.every(r => r.meta.referer?.includes('hblinks.dad'))).toBe(true);
  });

  test('handleHubLinks returns empty for dead hub host', async () => {
    const redirectUrl = new URL('https://gadgetsweb.xyz/id=abc');
    const refererUrl = new URL('https://new6.hdhub4u.fo/superman');
    const meta = { countryCodes: [CountryCode.multi] };

    (resolveRedirectUrl as jest.Mock).mockResolvedValue(new URL('https://hubcloud.ink/drive/abc'));

    const results = await source['handleHubLinks'](ctx, redirectUrl, refererUrl, meta);
    expect(results).toEqual([]);
  });

  test('fetchPageUrlsFromSearch returns matching results', async () => {
    const baseUrl = new URL('https://new6.hdhub4u.fo/');
    const imdbId = new ImdbId('tt5950044', undefined, undefined);

    jest.spyOn(fetcher, 'json').mockResolvedValue({
      hits: [
        { document: { imdb_id: 'tt5950044', permalink: '/superman-2025', post_title: 'Superman 2025' } },
        { document: { imdb_id: 'tt9999999', permalink: '/other', post_title: 'Other' } },
      ],
    });

    const results = await source['fetchPageUrlsFromSearch'](ctx, imdbId, baseUrl);
    expect(results).toHaveLength(1);
    expect(results.some(r => r.href.includes('superman-2025'))).toBe(true);
  });

  test('fetchPageUrlsFromSearch filters by season', async () => {
    const baseUrl = new URL('https://new6.hdhub4u.fo/');
    const imdbId = new ImdbId('tt4574334', 5, 1);

    jest.spyOn(fetcher, 'json').mockResolvedValue({
      hits: [
        { document: { imdb_id: 'tt4574334', permalink: '/stranger-things-s05', post_title: 'Stranger Things Season 5' } },
        { document: { imdb_id: 'tt4574334', permalink: '/stranger-things-s01', post_title: 'Stranger Things Season 1' } },
      ],
    });

    const results = await source['fetchPageUrlsFromSearch'](ctx, imdbId, baseUrl);
    expect(results).toHaveLength(1);
    expect(results.some(r => r.href.includes('s05'))).toBe(true);
  });

  test('fetchPageUrlsFromSiteSearch finds matching links', async () => {
    const baseUrl = new URL('https://new6.hdhub4u.fo/');
    const imdbId = new ImdbId('tt5950044', undefined, undefined);

    jest.spyOn(fetcher, 'text').mockResolvedValue(`<html><body>
      <a href="https://new6.hdhub4u.fo/superman-2025">Superman 2025 tt5950044</a>
      <a href="https://other.site/irrelevant">Other</a>
      <a href="https://new6.hdhub4u.fo/unrelated">Unrelated</a>
    </body></html>`);

    const results = await source['fetchPageUrlsFromSiteSearch'](ctx, imdbId, baseUrl);
    expect(results).toHaveLength(1);
    expect(results.some(r => r.href.includes('superman-2025'))).toBe(true);
  });

  test('getBaseUrl uses CDN discovery', async () => {
    jest.spyOn(fetcher, 'json').mockResolvedValue({
      c: btoa('https://new6.hdhub4u.fo'),
    });
    jest.spyOn(fetcher, 'head').mockResolvedValue({});

    const result = await source['getBaseUrl'](ctx);
    expect(result.href).toContain('hdhub4u');
  });

  test('getBaseUrl uses cached CDN URL on second call', async () => {
    const jsonSpy = jest.spyOn(fetcher, 'json').mockResolvedValue({
      c: btoa('https://new6.hdhub4u.fo'),
    });
    jest.spyOn(fetcher, 'head').mockResolvedValue({});

    await source['getBaseUrl'](ctx);
    jsonSpy.mockClear();

    const result = await source['getBaseUrl'](ctx);
    expect(result.href).toContain('hdhub4u');
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  test('getBaseUrl handles invalid CDN URL', async () => {
    jest.spyOn(fetcher, 'json').mockResolvedValue({
      c: btoa('not-a-valid-url'),
    });
    jest.spyOn(fetcher, 'text').mockResolvedValue('<html></html>');
    jest.spyOn(fetcher, 'head').mockResolvedValue({});

    const result = await source['getBaseUrl'](ctx);
    expect(result).toBeDefined();
  });

  test('getBaseUrl skips CDN URL with dead domain', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Source as any).deadDomains.set('dead.hdhub4u.limo', Date.now());

    jest.spyOn(fetcher, 'json').mockResolvedValue({
      c: btoa('https://dead.hdhub4u.limo'),
    });
    jest.spyOn(fetcher, 'head').mockResolvedValue({});

    const result = await source['getBaseUrl'](ctx);
    expect(result).toBeDefined();
    expect(result.hostname).not.toBe('dead.hdhub4u.limo');
  });

  test('fetchPageUrls returns search results without site search', async () => {
    const imdbId = new ImdbId('tt5950044', undefined, undefined);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn(source as any, 'getBaseUrl').mockResolvedValue(new URL('https://new6.hdhub4u.fo/'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn(source as any, 'fetchPageUrlsFromSearch').mockResolvedValue([
      new URL('https://new6.hdhub4u.fo/superman-2025'),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn(source as any, 'fetchPageUrlsFromSiteSearch');

    const results = await source['fetchPageUrls'](ctx, imdbId);
    expect(results).toHaveLength(1);
    expect(source['fetchPageUrlsFromSiteSearch']).not.toHaveBeenCalled();
  });

  test('handleInternal processes page URLs and returns results', async () => {
    const imdbId = new ImdbId('tt5950044', undefined, undefined);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn(source as any, 'fetchPageUrls').mockResolvedValue([
      new URL('https://new6.hdhub4u.fo/superman-2025'),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn(source as any, 'handlePage').mockResolvedValue([
      { url: new URL('https://hubdrive.dad/file/123'), meta: { countryCodes: [CountryCode.multi] } },
    ]);

    const results = await source['handleInternal'](ctx, 'movie', imdbId);
    expect(results).toHaveLength(1);
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
    resetCdnCache();
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
