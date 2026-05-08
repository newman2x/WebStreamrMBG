import bytes from 'bytes';
import * as cheerio from 'cheerio';
import { BasicAcceptedElems, CheerioAPI } from 'cheerio';
import { AnyNode } from 'domhandler';
import Fuse from 'fuse.js';
import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode, Meta } from '../types';
import { Fetcher, findCountryCodes, getTmdbId, getTmdbNameAndYear, Id, TmdbId } from '../utils';
import { resolveRedirectUrl } from './hd-hub-helper';
import { Source, SourceResult } from './Source';

const DEAD_DOMAINS = new Set([
  'hubcloud.ink',
  'hubcloud.co',
  'hubcloud.cc',
  'hubcloud.me',
  'hubcloud.xyz',
]);

const HUB_PATTERNS = /hubcloud|hubdrive|hubcdn/;
const PIXEL_PATTERNS = /pixel\.(hubcdn|rohitkiskk)/;

export class FourKHDHub extends Source {
  public readonly id = '4khdhub';

  public readonly label = '4KHDHub';

  public readonly contentTypes: ContentType[] = ['movie', 'series'];

  public readonly countryCodes: CountryCode[] = [CountryCode.multi, CountryCode.hi, CountryCode.ta, CountryCode.te];

  public readonly baseUrl = 'https://4khdhub.link';

  protected override readonly domainKey = '4kHDHub';

  private readonly FALLBACK_CANDIDATES = [
    'https://4khdhub.link',
    'https://4khdhub.click',
    'https://4khdhub.ink',
    'https://4khdhub.one',
    'https://4khdhub.to',
    'https://4khdhub.cc',
  ];

  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();

    this.fetcher = fetcher;
  }

  public async handleInternal(ctx: Context, _type: string, id: Id): Promise<SourceResult[]> {
    const tmdbId = await getTmdbId(ctx, this.fetcher, id);

    const pageUrl = await this.fetchPageUrl(ctx, tmdbId);
    if (!pageUrl) {
      return [];
    }

    const html = await this.fetcher.text(ctx, pageUrl);
    const $ = cheerio.load(html);

    if (tmdbId.season) {
      const results = await Promise.all(
        $(`.episode-item`)
          .filter((_i, el) => $('.episode-title', el).text().includes(`S${String(tmdbId.season).padStart(2, '0')}`))
          .map((_i, el) => ({
            countryCodes: [CountryCode.multi, ...findCountryCodes($(el).html() as string)],
            downloadItem: $('.episode-download-item', el)
              .filter((_i, el) => $(el).text().includes(`Episode-${String(tmdbId.episode).padStart(2, '0')}`))
              .get(0),
          })).filter((_i, { downloadItem }) => downloadItem !== undefined)
          .map(async (_id, { countryCodes, downloadItem }) => await this.extractSourceResults(ctx, $, downloadItem as BasicAcceptedElems<AnyNode>, countryCodes))
          .toArray(),
      );
      return results.flat();
    }

    const results = await Promise.all(
      $(`.download-item`)
        .map(async (_i, el) => await this.extractSourceResults(ctx, $, el, [CountryCode.multi, ...findCountryCodes($(el).html() as string)]))
        .toArray(),
    );
    return results.flat();
  };

  private readonly fetchPageUrl = async (ctx: Context, tmdbId: TmdbId): Promise<URL | undefined> => {
    const [name, year] = await getTmdbNameAndYear(ctx, this.fetcher, tmdbId);

    const searchUrl = new URL(`/?s=${encodeURIComponent(name)}`, await this.getBaseUrl(ctx));
    const html = await this.fetcher.text(ctx, searchUrl);

    const $ = cheerio.load(html);

    const typeSlug = tmdbId.season ? '-series-' : '-movie-';

    return $(`.movie-card`)
      .filter((_i, el) => {
        const href = String($(el).attr('href'));
        return href.includes(typeSlug);
      })
      .filter((_i, el) => {
        const movieCardYear = parseInt($('.movie-card-meta', el).text());

        return Math.abs(movieCardYear - year) <= 1;
      })
      .filter((_i, el) => {
        const movieCardTitle = $('.movie-card-title', el)
          .text()
          .replace(/\[.*?]/, '')
          .trim();

        const fuse = new Fuse([movieCardTitle], { threshold: 0.3 });
        return fuse.search(name).length > 0;
      })
      .map(async (_i, el) => new URL($(el).attr('href') as string, await this.getBaseUrl(ctx)))
      .get(0);
  };

  private readonly extractSourceResults = async (ctx: Context, $: CheerioAPI, el: BasicAcceptedElems<AnyNode>, countryCodes: CountryCode[]): Promise<SourceResult[]> => {
    const localHtml = $(el).html() as string;

    const sizeMatch = localHtml.match(/([\d.]+ ?[GM]B)/);
    const heightMatch = localHtml.match(/\d{3,}p/) as string[];

    const meta: Meta = {
      countryCodes: [...new Set([...countryCodes, ...findCountryCodes(localHtml)])],
      height: parseInt(heightMatch[0] as string),
      title: $('.file-title, .episode-file-title', el).text().trim(),
      ...(sizeMatch && { bytes: bytes.parse(sizeMatch[1] as string) as number }),
    };

    const urls: URL[] = [];
    const seenUrls = new Set<string>();

    $('a', el)
      .filter((_i, a) => {
        const href = $(a).attr('href');
        return !!href && HUB_PATTERNS.test(href);
      })
      .each((_i, a) => {
        const href = $(a).attr('href') as string;
        try {
          const url = new URL(href);
          if (seenUrls.has(url.href)) return;
          seenUrls.add(url.href);

          if (DEAD_DOMAINS.has(url.hostname.toLowerCase())) return;
          if (PIXEL_PATTERNS.test(url.href)) return;

          urls.push(url);
        } catch {
          // skip invalid URLs
        }
      });

    return Promise.all(urls.map(async url => ({
      url: await this.resolveIfRedirect(ctx, url),
      meta,
    })));
  };

  private readonly resolveIfRedirect = async (ctx: Context, url: URL): Promise<URL> => {
    if (/hubcloud|hubdrive|hubcdn/.test(url.hostname.toLowerCase())) {
      return url;
    }

    try {
      return await resolveRedirectUrl(ctx, this.fetcher, url);
    } catch {
      return url;
    }
  };

  private readonly getBaseUrl = async (ctx: Context): Promise<URL> => {
    return this.probeBaseUrl(ctx, this.fetcher, this.domainKey, this.FALLBACK_CANDIDATES);
  };
}
