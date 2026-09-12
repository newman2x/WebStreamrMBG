import { load } from 'cheerio';
import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode } from '../types';
import { Fetcher, getTmdbId, getTmdbNameAndYear, Id } from '../utils';
import { Source, SourceResult } from './Source';

export class SerienStream extends Source {
  public readonly id = 'serienstream';

  public readonly label = 'SerienStream';

  public override readonly contentTypes: ContentType[] = ['series' as ContentType];

  public override readonly countryCodes: CountryCode[] = [CountryCode.de];

  public override readonly baseUrl = 'https://serienstream.to';

  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();
    this.fetcher = fetcher;
  }

  protected override async handleInternal(ctx: Context, _type: ContentType, id: Id): Promise<SourceResult[]> {
    const tmdbId = await getTmdbId(ctx, this.fetcher, id);
    if (!tmdbId.season) {
      return [];
    }

    const [name, year] = await getTmdbNameAndYear(ctx, this.fetcher, tmdbId, 'de');
    const season = tmdbId.season;
    const episode = tmdbId.episode ?? 1;

    const episodePageUrl = await this.findEpisodeUrl(ctx, name, year, season, episode);
    const title = `${name} ${tmdbId.formatSeasonAndEpisode()}`;

    try {
      const pageBody = await this.fetcher.text(ctx, episodePageUrl);
      const $ = load(pageBody);
      const results: SourceResult[] = [];

      const redirectPromises: Promise<SourceResult | null>[] = [];

      $('a[href*="/redirect/"]').each((_i, el) => {
        const href = $(el).attr('href');
        const providerName = $(el).find('h4').text().trim() || $(el).text().trim().split('\n')[0] || 'Hoster';
        if (href) {
          const redirectUrl = href.startsWith('http') ? new URL(href) : new URL(href, this.baseUrl);
          redirectPromises.push((async () => {
            try {
              const finalUrl = await this.fetcher.getFinalRedirectUrl(ctx, redirectUrl, { headers: { Referer: episodePageUrl.href } });
              return {
                url: finalUrl,
                meta: {
                  countryCodes: [CountryCode.de],
                  referer: episodePageUrl.href,
                  title: `${providerName} - ${title}`,
                  sourceLabel: this.label,
                },
              };
            } catch {
              return {
                url: redirectUrl,
                meta: {
                  countryCodes: [CountryCode.de],
                  referer: episodePageUrl.href,
                  title: `Stream - ${title}`,
                  sourceLabel: this.label,
                },
              };
            }
          })());
        }
      });

      const resolved = (await Promise.all(redirectPromises)).filter((r): r is SourceResult => r !== null);
      if (resolved.length > 0) {
        return resolved;
      }

      $('button[data-play-url], [data-link-target]').each((_i, el) => {
        const playUrl = $(el).attr('data-play-url') ?? $(el).attr('data-link-target');
        const providerName = $(el).attr('data-provider-name') ?? $(el).text().trim() ?? 'Hoster';
        const langLabel = $(el).attr('data-language-label') ?? '';

        if (playUrl) {
          const fullUrl = playUrl.startsWith('http')
            ? new URL(playUrl)
            : new URL(playUrl, this.baseUrl);

          results.push({
            url: fullUrl,
            meta: {
              countryCodes: [CountryCode.de],
              referer: episodePageUrl.href,
              title: `${providerName}${langLabel ? ` (${langLabel})` : ''} - ${title}`,
              sourceLabel: this.label,
            },
          });
        }
      });

      return results;
    } catch {
      return [];
    }
  }

  private async findEpisodeUrl(
    ctx: Context,
    name: string,
    _year: number,
    season: number,
    episode: number,
  ): Promise<URL> {
    const searchUrl = new URL(`/suche?term=${encodeURIComponent(name)}`, this.baseUrl);
    let seriesSlug = '';

    try {
      const searchPageText = await this.fetcher.text(ctx, searchUrl);
      const $ = load(searchPageText);

      $('a[href*="/serie/stream/"], a[href*="/serie/"]').each((_i, el) => {
        const href = $(el).attr('href');
        if (href && !seriesSlug) {
          const match = href.match(/\/serie\/(?:stream\/)?([^/]+)/);
          if (match && match[1]) {
            seriesSlug = match[1];
          }
        }
      });
    } catch {
      // ignore
    }

    if (!seriesSlug) {
      seriesSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }

    return new URL(`/serie/stream/${seriesSlug}/staffel-${season}/episode-${episode}`, this.baseUrl);
  }
}
