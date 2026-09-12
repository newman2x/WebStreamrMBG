import { load } from 'cheerio';
import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode } from '../types';
import { Fetcher, getTmdbId, getTmdbNameAndYear, Id } from '../utils';
import { Source, SourceResult } from './Source';

export class AniWorld extends Source {
  public readonly id = 'aniworld';

  public readonly label = 'AniWorld';

  public override readonly contentTypes: ContentType[] = ['series' as ContentType, 'movie' as ContentType];

  public override readonly countryCodes: CountryCode[] = [CountryCode.de];

  public override readonly baseUrl = 'https://aniworld.to';

  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();
    this.fetcher = fetcher;
  }

  protected override async handleInternal(ctx: Context, _type: ContentType, id: Id): Promise<SourceResult[]> {
    const tmdbId = await getTmdbId(ctx, this.fetcher, id);
    const [name, year] = await getTmdbNameAndYear(ctx, this.fetcher, tmdbId, 'de');

    const season = tmdbId.season ?? 1;
    const episode = tmdbId.episode ?? 1;
    const isMovie = !tmdbId.season;

    const episodePageUrl = await this.findEpisodeUrl(ctx, name, year, season, episode, isMovie);
    const title = isMovie
      ? `${name} (${year})`
      : `${name} ${tmdbId.formatSeasonAndEpisode()}`;

    try {
      const html = await this.fetcher.text(ctx, episodePageUrl);
      const $ = load(html);
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

      $('button[data-play-url]').each((_i, el) => {
        const playUrl = $(el).attr('data-play-url');
        const providerName = $(el).attr('data-provider-name') ?? 'Hoster';
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
    isMovie: boolean,
  ): Promise<URL> {
    const searchUrl = new URL(`/suche?term=${encodeURIComponent(name)}`, this.baseUrl);
    let animeSlug = '';

    try {
      const searchHtml = await this.fetcher.text(ctx, searchUrl);
      const $ = load(searchHtml);

      $('a[href*="/anime/stream/"]').each((_i, el) => {
        const href = $(el).attr('href');
        if (href && !animeSlug) {
          const match = href.match(/\/anime\/stream\/([^/]+)/);
          if (match && match[1]) {
            animeSlug = match[1];
          }
        }
      });
    } catch {
      // ignore
    }

    if (!animeSlug) {
      animeSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }

    if (isMovie) {
      return new URL(`/anime/stream/${animeSlug}/filme/film-${episode}`, this.baseUrl);
    }

    return new URL(`/anime/stream/${animeSlug}/staffel-${season}/episode-${episode}`, this.baseUrl);
  }
}
