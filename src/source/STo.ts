import * as cheerio from 'cheerio';
import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode } from '../types';
import { Fetcher, getTmdbId, getTmdbNameAndYear, Id } from '../utils';
import { Source, SourceResult } from './Source';

export class STo extends Source {
  public readonly id = 'sto';
  public readonly label = 's.to';
  public readonly contentTypes: ContentType[] = ['series'];
  public readonly countryCodes: CountryCode[] = [CountryCode.de];
  public readonly baseUrl = 'https://s.to';
  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();
    this.fetcher = fetcher;
  }

  public async handleInternal(ctx: Context, _type: string, id: Id): Promise<SourceResult[]> {
    const tmdbId = await getTmdbId(ctx, this.fetcher, id);
    const [name] = await getTmdbNameAndYear(ctx, this.fetcher, tmdbId, 'de');

    const season = tmdbId.season ?? 1;
    const episode = tmdbId.episode ?? 1;
    const searchId = id.id.toString();

    console.log(`[${this.label}] Processing: ${name} (S${season}E${episode}) [IMDb: ${searchId}]`);

    const pageUrl = await this.fetchPageUrl(ctx, searchId, season, episode);
    if (!pageUrl) {
      console.log(`[${this.label}] No results found for ID: ${searchId}`);
      return [];
    }

    const html = await this.fetcher.text(ctx, pageUrl);
    const $ = cheerio.load(html);
    const hosterButtons = $('#episode-links button.link-box');

    const redirectPromises: Promise<SourceResult | null>[] = [];

    hosterButtons.each((_i, el) => {
      const playUrlPath = $(el).attr('data-play-url');
      const provider = $(el).attr('data-provider-name') || 'Unknown';
      const language = $(el).attr('data-language-label') || 'Deutsch';

      if (playUrlPath) {
        redirectPromises.push(
          this.resolveRedirect(playUrlPath, pageUrl.href).then((finalUrl) => {
            if (!finalUrl) return null;

            return {
              url: new URL(finalUrl),
              meta: {
                countryCodes: [CountryCode.de],
                referer: pageUrl.href,
                title: `[${provider}] ${name} - S${season}E${episode} (${language})`,
              },
            };
          })
        );
      }
    });

    const results = await Promise.all(redirectPromises);
    return results.filter((r): r is SourceResult => r !== null);
  }

  /**
   * Löst den s.to internen Link zum Zielhoster auf.
   * Nutzt natives fetch, um Zugriff auf die finale URL nach Redirects zu erhalten.
   */
  private async resolveRedirect(path: string, referer: string): Promise<string | undefined> {
    try {
      const url = path.startsWith('http')
        ? path
        : new URL(path.startsWith('/') ? path : `/${path}`, this.baseUrl).toString();

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Referer': referer,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        redirect: 'follow',
      });

      const finalUrl = response.url;

      // Wenn wir immer noch auf s.to landen, wurde der Redirect durch Captcha o.ä. blockiert
      if (finalUrl.includes('s.to/redirect') || finalUrl.includes('s.to/captcha')) {
        return undefined;
      }

      return finalUrl;
    } catch (e) {
      return undefined;
    }
  }

  private readonly fetchPageUrl = async (
    ctx: Context,
    idString: string,
    season: number,
    episode: number
  ): Promise<URL | undefined> => {
    const searchUrl = new URL(`/suche?term=${encodeURIComponent(idString)}`, this.baseUrl);
    const html = await this.fetcher.text(ctx, searchUrl);
    const $ = cheerio.load(html);

    let seriesPath = $('.show-cover').first().attr('href');
    if (!seriesPath) return undefined;

    if (seriesPath.startsWith('/serie/') && !seriesPath.includes('/stream/')) {
      seriesPath = seriesPath.replace('/serie/', '/serie/stream/');
    }

    const sanitizedPath = `${seriesPath}/staffel-${season}/episode-${episode}`.replace(/\/+/g, '/');
    return new URL(sanitizedPath, this.baseUrl);
  };
}
