import * as cheerio from 'cheerio';
import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode } from '../types';
import { Fetcher, Id } from '../utils';
import { Source, SourceResult } from './Source';

export class FilmpalastTO extends Source {
  public override readonly id = 'filmpalast';
  public override readonly label = 'Filmpalast';
  public override readonly baseUrl = 'https://filmpalast.to';

  public override readonly contentTypes: ContentType[] = [
    'movie' as ContentType,
  ];

  public override readonly countryCodes = [CountryCode.de];
  public override readonly priority = 1;

  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();
    this.fetcher = fetcher;
  }

  protected override async handleInternal(
    ctx: Context,
    _type: ContentType,
    id: Id,
  ): Promise<SourceResult[]> {
    const results: SourceResult[] = [];
    const imdbId = id.toString();

    try {
      // Step 1: Autocomplete
      const autocompleteUrl = new URL(`${this.baseUrl}/autocomplete.php`);

      const responseText = await this.fetcher.textPost(
        ctx,
        autocompleteUrl,
        `term=${encodeURIComponent(imdbId)}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': this.baseUrl,
          },
        },
      );

      const movieList = JSON.parse(responseText);

      if (!Array.isArray(movieList) || movieList.length === 0) {
        return [];
      }

      // Filter out English results to prioritize German dubbed content
      const filteredResult = movieList.find(title => 
        !title.toLowerCase().includes('english')
      ) || movieList[0];

      const searchPageURL = `${this.baseUrl}/search/title/${encodeURIComponent(filteredResult)}`;

      // Step 2: Find stream page
      const html = await this.fetcher.text(ctx, new URL(searchPageURL));
      const $ = cheerio.load(html);

      let streamPageUrl: string | undefined;
      const streamAnchor = $('a[href*="filmpalast.to/stream/"]').first();

      if (streamAnchor.length > 0) {
        const href = streamAnchor.attr('href');
        if (href) {
          streamPageUrl = href.startsWith('http') 
            ? href 
            : `${this.baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
        }
      } else if (html.includes('currentStreamLinks')) {
        streamPageUrl = searchPageURL;
      }

      if (!streamPageUrl) return [];

      // Step 3: Extract hoster links
      const streamHtml = await this.fetcher.text(ctx, new URL(streamPageUrl));
      const $stream = cheerio.load(streamHtml);

      // Targeting the specific button structure found in your trace
      const linkElements = $stream('a.button[data-player-url]');

      linkElements.each((_, element) => {
        // FIX: Extract from data-player-url instead of href
        const playerUrl = $stream(element).attr('data-player-url');
        let hosterName = $stream(element).text().trim();

        if (playerUrl && playerUrl.startsWith('http')) {
          // Fallback for hoster name if text is empty or just a number
          if (!hosterName || !isNaN(Number(hosterName))) {
            const classes = $stream(element).attr('class') || '';
            // Try to extract hoster name from class (e.g., "verystream")
            hosterName = classes.split(' ').pop() || 'Stream';
          }

          try {
            results.push({
              url: new URL(playerUrl),
              meta: {
                title: `${hosterName.toUpperCase()} (Filmpalast)`,
                countryCodes: [CountryCode.de],
              },
            });
          } catch {
            // Context-injected logger handles silent failures
            ctx.logger.debug(`[Filmpalast] Invalid URL skipped: ${playerUrl}`);
          }
        }
      });

      ctx.logger.info(`[Filmpalast] Found ${results.length} results for ${imdbId}`);
    } catch (error) {
      ctx.logger.error(`[Filmpalast] Scraper failed for ${imdbId}`, { error });
    }

    return results;
  }
}
