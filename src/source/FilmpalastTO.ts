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
    id: Id,
  ): Promise<SourceResult[]> {
    const results: SourceResult[] = [];
    const imdbId = id.toString();

    try {
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

      const filteredResult = movieList.find(title => !title.toLowerCase().includes('english')) || movieList[0];
      const searchPageURL = `${this.baseUrl}/search/title/${encodeURIComponent(filteredResult)}`;

      const html = await this.fetcher.text(ctx, new URL(searchPageURL));
      const $ = cheerio.load(html);

      let streamPageUrl: string | undefined;
      const streamAnchor = $('a[href*="filmpalast.to/stream/"]').first();

      if (streamAnchor.length > 0) {
        const href = streamAnchor.attr('href');
        if (href) {
          streamPageUrl = href.startsWith('http') ? href : href.startsWith('//') ? `https:${href}` : `${this.baseUrl}${href}`;
        }
      } else if (html.includes('currentStreamLinks')) {
        streamPageUrl = searchPageURL;
      }

      if (!streamPageUrl) return [];

     // Step 3: Extract hoster links
      const streamHtml = await this.fetcher.text(ctx, new URL(streamPageUrl));
      const $stream = cheerio.load(streamHtml);

      const linkElements = $stream('.currentStreamLinks a.button');

      linkElements.each((_, element) => {
        const $el = $stream(element);
        
        // 1. Try data-player-url first, then fallback to href
        const rawUrl = $el.attr('data-player-url') || $el.attr('href');
        
        // 2. Find the hoster name by looking at the sibling/parent structure
        let hosterName = $el.closest('ul').find('.hostName').text().trim();
        
        if (!hosterName) {
          hosterName = $el.text().trim().replace('Play', '').trim() || 'Stream';
        }

        if (rawUrl && rawUrl.startsWith('http') && !rawUrl.includes('javascript:void')) {
          try {
            const finalUrl = new URL(rawUrl);

            results.push({
              url: finalUrl,
              meta: {
                title: `${hosterName} (Filmpalast)`,
                countryCodes: [CountryCode.de],
              },
            });
          } catch (error) {
          }
        }
      });

      if (results.length > 0) {
        console.info(`[Filmpalast] Found ${results.length} results for ${imdbId}`);
      }
}
