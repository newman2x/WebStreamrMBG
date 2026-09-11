import * as cheerio from 'cheerio';
import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode } from '../types';
import { Fetcher, getTmdbId, getTmdbNameAndYear, Id } from '../utils';
import { Source, SourceResult } from './Source';

const STREAMING_HOSTS = [
  'voe', 'dood', 'streamtape', 'veev', 'vinovo', 'vidhide', 'dhtpre',
  'mixdrop', 'supervideo', 'uqload', 'filelion', 'lulustream', 'fastream',
  'dropload', 'savefiles', 'streamembed', 'vidara', 'vidsonic', 'filemoon',
  'meinecloud',
];

const isStreamingHost = (hostname: string): boolean =>
  STREAMING_HOSTS.some(host => hostname.includes(host));

export class HDFilme extends Source {
  public readonly id = 'hdfilme';

  public readonly label = 'HDFilme';

  public override readonly contentTypes: ContentType[] = ['movie' as ContentType, 'series' as ContentType];

  public override readonly countryCodes: CountryCode[] = [CountryCode.de];

  public override readonly baseUrl = 'https://hdfilme-tv.help';

  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();
    this.fetcher = fetcher;
  }

  protected override async handleInternal(ctx: Context, _type: ContentType, id: Id): Promise<SourceResult[]> {
    const tmdbId = await getTmdbId(ctx, this.fetcher, id);
    const [name, year] = await getTmdbNameAndYear(ctx, this.fetcher, tmdbId, 'de');

    const streamPageUrl = await this.fetchStreamPageUrl(ctx, name, year, tmdbId.season, tmdbId.episode);
    if (!streamPageUrl) {
      return [];
    }

    const title = tmdbId.season
      ? `${name} ${tmdbId.formatSeasonAndEpisode()}`
      : `${name} (${year})`;

    try {
      const html = await this.fetcher.text(ctx, streamPageUrl);
      const $ = cheerio.load(html);
      const results: SourceResult[] = [];

      $('[data-link]').each((_i, el) => {
        let link = $(el).attr('data-link')?.trim();
        if (!link) return;

        if (link.startsWith('//')) {
          link = 'https:' + link;
        } else if (!link.startsWith('http')) {
          link = 'https://' + link;
        }

        try {
          const url = new URL(link);
          results.push({
            url,
            meta: {
              countryCodes: [CountryCode.de],
              referer: streamPageUrl.href,
              title: `${url.hostname} - ${title}`,
              sourceLabel: this.label,
            },
          });
        } catch {
          // ignore
        }
      });

      $('iframe[src], a[href]').each((_i, el) => {
        const href = $(el).attr('src') ?? $(el).attr('href');
        if (!href || href === '#' || href.startsWith('javascript')) return;

        try {
          const fullHref = href.startsWith('//') ? `https:${href}` : href;
          const url = new URL(fullHref.startsWith('http') ? fullHref : `${this.baseUrl}${fullHref}`);

          if (isStreamingHost(url.hostname)) {
            results.push({
              url,
              meta: {
                countryCodes: [CountryCode.de],
                referer: streamPageUrl.href,
                title: `${url.hostname} - ${title}`,
                sourceLabel: this.label,
              },
            });
          }
        } catch {
          // ignore
        }
      });

      return results;
    } catch {
      return [];
    }
  }

  private async fetchStreamPageUrl(
    ctx: Context,
    name: string,
    year: number,
    season?: number,
    episode?: number,
  ): Promise<URL | undefined> {
    const searchQuery = season
      ? `${name} S${String(season).padStart(2, '0')}E${String(episode ?? 1).padStart(2, '0')}`
      : name;

    const searchUrl = new URL(`/index.php?do=search&subaction=search&story=${encodeURIComponent(searchQuery)}`, this.baseUrl);
    try {
      const html = await this.fetcher.text(ctx, searchUrl);
      const $ = cheerio.load(html);

      const candidates: { href: string; title: string }[] = [];

      $('.box-product, .product-item, .film-item, a[href*="/stream/"], a[href*="/kinofilme"], a[href*="/serie"]').each((_i, el) => {
        const href = $(el).attr('href') ?? $(el).find('a').attr('href');
        const titleText = $(el).text().trim() || $(el).attr('title') || '';
        if (href && !href.startsWith('javascript') && href !== '#') {
          candidates.push({ href, title: titleText });
        }
      });

      if (candidates.length === 0) {
        return undefined;
      }

      if (!season && year) {
        const yearMatch = candidates.find(c => c.title.includes(String(year)));
        if (yearMatch) {
          const fullHref = yearMatch.href.startsWith('http') ? yearMatch.href : `${this.baseUrl}${yearMatch.href}`;
          return new URL(fullHref);
        }
      }

      const first = candidates[0];
      if (!first) {
        return undefined;
      }
      const fullHref = first.href.startsWith('http') ? first.href : `${this.baseUrl}${first.href}`;
      return new URL(fullHref);
    } catch {
      return undefined;
    }
  }
}
