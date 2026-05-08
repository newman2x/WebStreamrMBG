import * as cheerio from 'cheerio';
import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode, Meta } from '../types';
import { Fetcher, findCountryCodes, getImdbId, Id, ImdbId } from '../utils';
import { resolveRedirectUrl } from './hd-hub-helper';
import { Source, SourceResult } from './Source';

interface CdnHostResponse {
  h?: string;
  c?: string;
  t?: number;
}

interface SearchResponsePartial {
  hits: {
    document: {
      imdb_id: string;
      permalink: string;
      post_title: string;
    };
  }[];
}

const CDN_HOST_URL = 'https://cdn.hdhub4u.glass/host/';
const CDN_HOST_TTL = 4 * 60 * 60 * 1000;

let cdnDiscoveredUrl: string | null = null;
let cdnDiscoveryTs = 0;

export function resetCdnCache(): void {
  cdnDiscoveredUrl = null;
  cdnDiscoveryTs = 0;
}

const HOST_PATTERNS = ['hubdrive', 'hubcloud', 'hubcdn'];
const EXCLUDED_HREF_PATTERNS = ['gadgetsweb', '4khdhub', 'linksly', 'shareus', 'dood', 'desiupload', 'megaup', 'filepress', 'mediashore', 'ninjastream', 'hubstream'];
const DEAD_HOST_DOMAINS = new Set(['hubcloud.ink', 'hubcloud.co', 'hubcloud.cc', 'hubcloud.me', 'hubcloud.xyz']);

export class HDHub4u extends Source {
  public readonly id = 'hdhub4u';

  public readonly label = 'HDHub4u';

  public readonly contentTypes: ContentType[] = ['movie', 'series'];

  public readonly countryCodes: CountryCode[] = [CountryCode.multi, CountryCode.gu, CountryCode.hi, CountryCode.ml, CountryCode.pa, CountryCode.ta, CountryCode.te];

  public readonly baseUrl = 'https://new1.hdhub4u.limo';

  protected override readonly domainKey = 'hdhub';

  private readonly FALLBACK_CANDIDATES = [
    'https://new1.hdhub4u.limo',
    'https://new1.hdhub4u.fo',
    'https://new2.hdhub4u.fo',
    'https://new3.hdhub4u.fo',
    'https://new4.hdhub4u.fo',
    'https://new5.hdhub4u.fo',
    'https://new6.hdhub4u.fo',
    'https://new7.hdhub4u.fo',
    'https://new8.hdhub4u.fo',
    'https://new9.hdhub4u.fo',
    'https://new10.hdhub4u.fo',
  ];

  private readonly searchUrl = 'https://search.hdhub4u.glass';

  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();

    this.fetcher = fetcher;
  }

  public async handleInternal(ctx: Context, _type: string, id: Id): Promise<SourceResult[]> {
    const imdbId = await getImdbId(ctx, this.fetcher, id);

    const pageUrls = await this.fetchPageUrls(ctx, imdbId);

    return (await Promise.all(
      pageUrls.map(async (pageUrl) => {
        return await this.handlePage(ctx, pageUrl, imdbId);
      }),
    )).flat();
  };

  private readonly handlePage = async (ctx: Context, pageUrl: URL, imdbId: ImdbId): Promise<SourceResult[]> => {
    const html = await this.fetcher.text(ctx, pageUrl);

    const $ = cheerio.load(html);

    const meta = {
      countryCodes: [CountryCode.multi, ...findCountryCodes($('div:contains("Language"):not(:has(div)):first').text())],
    };

    if (!imdbId.episode) {
      return [
        ...this.extractHubDriveUrlResults(html, meta),
        ...(await Promise.all(
          $('a[href*="gadgetsweb"]').map((_i, el) => this.handleHubLinks(ctx, new URL($(el).attr('href') as string), pageUrl, meta)),
        )).flat(),
      ];
    }

    const ep = imdbId.episode;
    const epPadded = String(ep).padStart(2, '0');
    const episodeSelector = [
      `h4:contains("EPiSODE ${ep}")`,
      `h4:contains("E${epPadded} ")`,
      `h4:contains("E${ep} ")`,
      `h4:contains("EPiSODE ${epPadded}")`,
      `h4:contains("Episode ${ep}")`,
      `h4:contains("Episode ${epPadded}")`,
      `h2:contains("EPiSODE ${ep}")`,
      `h2:contains("EPiSODE ${epPadded}")`,
      `h2:contains("Episode ${ep}")`,
      `h2:contains("Episode ${epPadded}")`,
    ].join(', ');

    const heading = $(episodeSelector).first();
    const headingAndAfterHtml = $.html(heading)
      + heading.nextUntil('hr').map((_i, el) => $.html(el)).get().join('');

    return [
      ...this.extractHubDriveUrlResults(headingAndAfterHtml, meta),
    ];
  };

  private readonly handleHubLinks = async (ctx: Context, redirectUrl: URL, refererUrl: URL, meta: Meta): Promise<SourceResult[]> => {
    const resolvedUrl = await resolveRedirectUrl(ctx, this.fetcher, redirectUrl);

    if (HOST_PATTERNS.some(p => resolvedUrl.host.toLowerCase().includes(p))) {
      if (!DEAD_HOST_DOMAINS.has(resolvedUrl.host.toLowerCase())) {
        return [{ url: resolvedUrl, meta: { ...meta, referer: refererUrl.href } }];
      }
      return [];
    }

    const hubLinksHtml = await this.fetcher.text(ctx, resolvedUrl, { headers: { Referer: refererUrl.href } });

    return [
      ...this.extractHubDriveUrlResults(hubLinksHtml, { ...meta, referer: resolvedUrl.href }),
    ];
  };

  private readonly extractHubDriveUrlResults = (html: string, meta: Meta): SourceResult[] => {
    const $ = cheerio.load(html);
    const allLinks = $('a').filter((_i, el) => {
      const href = ($(el).attr('href') ?? '').toLowerCase();
      if (!href) return false;
      if (EXCLUDED_HREF_PATTERNS.some(p => href.includes(p))) return false;
      return HOST_PATTERNS.some(p => href.includes(p));
    });
    const filteredLinks = allLinks.not(':contains("⚡")');

    return filteredLinks
      .map((_i, el) => {
        try {
          const url = new URL($(el).attr('href') as string);
          if (DEAD_HOST_DOMAINS.has(url.host.toLowerCase())) return null;
          return { url, meta };
        } catch {
          return null;
        }
      })
      .toArray()
      .filter((r): r is SourceResult => r !== null);
  };

  private readonly fetchPageUrls = async (ctx: Context, imdbId: ImdbId): Promise<URL[]> => {
    const baseUrl = await this.getBaseUrl(ctx);

    const results = await this.fetchPageUrlsFromSearch(ctx, imdbId, baseUrl);
    if (results.length > 0) {
      return results;
    }

    return this.fetchPageUrlsFromSiteSearch(ctx, imdbId, baseUrl);
  };

  private readonly fetchPageUrlsFromSearch = async (ctx: Context, imdbId: ImdbId, baseUrl: URL): Promise<URL[]> => {
    try {
      const searchUrl = new URL(`/collections/post/documents/search?query_by=imdb_id&q=${encodeURIComponent(imdbId.id)}`, this.searchUrl);
      const searchResponse = await this.fetcher.json(ctx, searchUrl, { headers: { Referer: baseUrl.href } }) as SearchResponsePartial;

      return searchResponse.hits
        .filter(hit =>
          hit.document.imdb_id === imdbId.id
          && (
            !imdbId.season
            || hit.document.post_title.includes(`Season ${imdbId.season}`)
            || hit.document.post_title.includes(`S${String(imdbId.season)}`)
            || hit.document.post_title.includes(`S${String(imdbId.season).padStart(2, '0')}`)
          ),
        )
        .map(hit => new URL(hit.document.permalink, baseUrl));
    } catch {
      return [];
    }
  };

  private readonly fetchPageUrlsFromSiteSearch = async (ctx: Context, imdbId: ImdbId, baseUrl: URL): Promise<URL[]> => {
    try {
      const siteSearchUrl = new URL(`/?s=${encodeURIComponent(imdbId.id)}`, baseUrl);
      const html = await this.fetcher.text(ctx, siteSearchUrl);
      const $ = cheerio.load(html);

      return $('a')
        .filter((_i, el) => {
          const href = $(el).attr('href') ?? '';
          const text = $(el).text();
          return href.startsWith(baseUrl.origin)
            && (text.includes(imdbId.id) || href.includes(imdbId.id));
        })
        .map((_i, el) => new URL($(el).attr('href') as string))
        .toArray();
    } catch {
      return [];
    }
  };

  private async discoverFromCdn(ctx: Context): Promise<string | null> {
    if (cdnDiscoveredUrl && Date.now() - cdnDiscoveryTs < CDN_HOST_TTL) {
      return cdnDiscoveredUrl;
    }

    try {
      const d = new Date();
      const seed = (d.getFullYear() * 1000000) + ((d.getMonth() + 1) * 10000) + (d.getDate() * 100) + d.getHours() + 1;
      const url = new URL(`?v=${seed}`, CDN_HOST_URL);
      const response = await this.fetcher.json(ctx, url) as CdnHostResponse;

      if (response.c) {
        const decoded = atob(response.c.replace(/\/$/, ''));
        const baseUrl = decoded.replace(/[?&]utm=[^&]*/, '').replace(/\/$/, '');
        cdnDiscoveredUrl = baseUrl;
        cdnDiscoveryTs = Date.now();
        return baseUrl;
      }
    } catch { /* CDN endpoint unreachable */ }

    return null;
  }

  private readonly getBaseUrl = async (ctx: Context) => {
    const cdnUrl = await this.discoverFromCdn(ctx);
    if (cdnUrl) {
      const hostname = (() => {
        try {
          return new URL(cdnUrl).hostname;
        } catch {
          return '';
        }
      })();
      const diedAt = hostname ? Source.deadDomains.get(hostname) : undefined;
      const isKnownDead = diedAt && Date.now() - diedAt < Source.DEAD_DOMAIN_TTL;

      if (!isKnownDead) {
        try {
          return new URL(cdnUrl);
        } catch {
          // invalid CDN URL, fall through to probeBaseUrl
        }
      }
    }

    return this.probeBaseUrl(ctx, this.fetcher, this.domainKey, this.FALLBACK_CANDIDATES);
  };
}
