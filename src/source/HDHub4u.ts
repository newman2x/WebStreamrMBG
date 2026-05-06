import * as cheerio from 'cheerio';
import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode, Meta } from '../types';
import { Fetcher, findCountryCodes, getImdbId, Id, ImdbId } from '../utils';
import { resolveRedirectUrl } from './hd-hub-helper';
import { Source, SourceResult } from './Source';

interface SearchResponsePartial {
  hits: {
    document: {
      imdb_id: string;
      permalink: string;
      post_title: string;
    };
  }[];
}

export class HDHub4u extends Source {
  public readonly id = 'hdhub4u';

  public readonly label = 'HDHub4u';

  public readonly contentTypes: ContentType[] = ['movie', 'series'];

  public readonly countryCodes: CountryCode[] = [CountryCode.multi, CountryCode.gu, CountryCode.hi, CountryCode.ml, CountryCode.pa, CountryCode.ta, CountryCode.te];

  public readonly baseUrl = 'https://new7.hdhub4u.fo';

  private readonly DOMAIN_KEY = 'hdhub4u';

  private readonly FALLBACK_CANDIDATES = Array.from(
    { length: 10 }, (_, i) => `https://new${i + 1}.hdhub4u.fo`,
  );

  private readonly searchUrl = 'https://search.pingora.fyi';

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
    const hubLinksUrl = await resolveRedirectUrl(ctx, this.fetcher, redirectUrl);
    const hubLinksHtml = await this.fetcher.text(ctx, hubLinksUrl, { headers: { Referer: refererUrl.href } });

    return [
      ...this.extractHubDriveUrlResults(hubLinksHtml, { ...meta, referer: hubLinksUrl.href }),
    ];
  };

  private readonly extractHubDriveUrlResults = (html: string, meta: Meta): SourceResult[] => {
    const $ = cheerio.load(html);
    const allLinks = $('a[href*="hubdrive"], a[href*="hubcdn.fans"], a[href*="hdstream4u.com"], a[href*="hblinks.dad"], a[href*="hubcloud"]');
    const filteredLinks = allLinks.not(':contains("⚡")');

    return filteredLinks
      .map((_i, el) => ({ url: new URL($(el).attr('href') as string), meta }))
      .toArray();
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

  private readonly getBaseUrl = async (ctx: Context) => {
    return this.probeBaseUrl(ctx, this.fetcher, this.DOMAIN_KEY, this.FALLBACK_CANDIDATES);
  };
}
