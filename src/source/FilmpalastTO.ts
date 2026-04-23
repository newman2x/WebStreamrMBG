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
    'series' as ContentType,
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
      if (!Array.isArray(movieList) || movieList.length === 0) return [];

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
            : href.startsWith('//') 
              ? `https:${href}` 
              : `${this.baseUrl}${href}`;
        }
      } else if (html.includes('currentStreamLinks')) {
        streamPageUrl = searchPageURL;
      }

      if (!streamPageUrl) return [];

      // Step 3: Extract hoster links
      const streamHtml = await this.fetcher.text(ctx, new URL(streamPageUrl));
      const $stream = cheerio.load(streamHtml);

      $stream('.currentStreamLinks a.button').each((_, element) => {
        const $el = $stream(element);
        
        // Check BOTH attributes to catch Veev (data-player-url) AND VOE/Vidara (href)
        const rawUrl = $el.attr('data-player-url') || $el.attr('href');
        let hosterName = $el.closest('ul').find('.hostName').text().trim();

        if (!hosterName) {
          hosterName = $el.text().trim().replace('Play', '').trim() || 'Stream';
        }

        if (rawUrl && rawUrl.startsWith('http') && !rawUrl.includes('javascript:void')) {
          try {
            results.push({
              url: new URL(rawUrl),
              meta: {
                title: `${hosterName} (Filmpalast)`,
                countryCodes: [CountryCode.de],
              },
            });
          } catch {
            // Invalid URL skip
          }
        }
      });

    } catch (error) {
      // Use console.error since Context.logger is missing. 
      // Using 'error' variable prevents linting issues.
      console.error(`[Filmpalast] Scraper error for ${imdbId}:`, error);
    }

    return results;
  }
}
