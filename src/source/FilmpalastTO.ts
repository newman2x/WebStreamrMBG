import * as cheerio from 'cheerio';
import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode } from '../types';
import { Fetcher, Id } from '../utils';
import { Source, SourceResult } from './Source';

export class FilmpalastTO extends Source {
  public override readonly id = 'filmpalast';
  public override readonly label = 'Filmpalast';
  public override readonly baseUrl = 'https://filmpalast.to';
  public override readonly contentTypes: ContentType[] = ['movie' as ContentType, 'series' as ContentType];
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
    id: Id
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
            Referer: this.baseUrl,
          },
        }
      );

      const movieList = JSON.parse(responseText);

      if (!Array.isArray(movieList) || movieList.length === 0) {
        return [];
      }

      // ✅ FIXED: no parentheses around single param
     const filteredResult = movieList.find(title => !title.toLowerCase().includes('english')) || movieList[0];

      const searchPageURL = `${this.baseUrl}/search/title/${encodeURIComponent(
        filteredResult
      )}`;

      // Step 2: Find stream page
      const html = await this.fetcher.text(ctx, new URL(searchPageURL));
      const $ = cheerio.load(html);

      let streamPageUrl: string | undefined;

      const streamAnchor = $('a[href*="filmpalast.to/stream/"]').first();

      if (streamAnchor.length > 0) {
        const href = streamAnchor.attr('href');

        if (href) {
          if (href.startsWith('http')) {
            streamPageUrl = href;
          } else if (href.startsWith('//')) {
            streamPageUrl = `https:${href}`;
          } else {
            streamPageUrl = `${this.baseUrl}${href}`;
          }
        }
      } else if (html.includes('currentStreamLinks')) {
        streamPageUrl = searchPageURL;
      }

      if (!streamPageUrl) {
        return [];
      }

      // Step 3: Extract hoster links
      const streamHtml = await this.fetcher.text(ctx, new URL(streamPageUrl));
      const $stream = cheerio.load(streamHtml);

      const linkElements = $stream(
        '.currentStreamLinks a, .hosterSite span a, .streamList a'
      );

      // ✅ VALID: multiple params → parentheses REQUIRED
      linkElements.each((_, element) => {
        const href = $stream(element).attr('href');
        let hosterName = $stream(element).text().trim();

        if (href && href !== '#' && !href.includes('javascript:void')) {
          let fullUrl: string;

          if (href.startsWith('http')) {
            fullUrl = href;
          } else if (href.startsWith('//')) {
            fullUrl = `https:${href}`;
          } else {
            fullUrl = `https://${href}`;
          }

          if (!hosterName || !isNaN(Number(hosterName))) {
            hosterName = $stream(element).attr('title') || 'Stream';
          }

          console.info(
            `[Filmpalast] Found Link: ${fullUrl} (${hosterName})`
          );

          try {
            results.push({
              url: new URL(fullUrl),
              meta: {
                title: `${hosterName} (Filmpalast)`,
                countryCodes: [CountryCode.de],
              },
            });
          } catch {
            // ignore invalid URLs
          }
        }
      });

      console.info(
        `[Filmpalast] Successfully added ${results.length} results for ${imdbId}`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';

      console.error(
        `[Filmpalast] Scraper failed for ${imdbId}: ${message}`
      );
    }

    return results;
  }
}
