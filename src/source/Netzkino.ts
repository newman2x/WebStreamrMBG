import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode } from '../types';
import { Fetcher, getTmdbId, getTmdbNameAndYear, Id } from '../utils';
import { Source, SourceResult } from './Source';

interface NetzkinoPost {
  title?: string;
  custom_fields?: {
    Streaming?: string[];
    [key: string]: unknown;
  };
  slug?: string;
}

interface NetzkinoSearchResponse {
  posts?: NetzkinoPost[];
  [key: string]: unknown;
}

export class Netzkino extends Source {
  public readonly id = 'netzkino';

  public readonly label = 'Netzkino';

  public override readonly contentTypes: ContentType[] = ['movie' as ContentType];

  public override readonly countryCodes: CountryCode[] = [CountryCode.de];

  public override readonly baseUrl = 'https://netzkino.de';

  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();
    this.fetcher = fetcher;
  }

  protected override async handleInternal(ctx: Context, _type: ContentType, id: Id): Promise<SourceResult[]> {
    const tmdbId = await getTmdbId(ctx, this.fetcher, id);
    const [name, year] = await getTmdbNameAndYear(ctx, this.fetcher, tmdbId, 'de');

    const searchUrl = new URL(`https://api.netzkino.de.c.footprint.net/post_slug.php?slug=${encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'))}`);

    try {
      const data = await this.fetcher.json(ctx, searchUrl) as NetzkinoSearchResponse;
      const posts = data.posts ?? [];

      const results: SourceResult[] = [];

      for (const post of posts) {
        const streamUrl = post.custom_fields?.Streaming?.[0];
        if (streamUrl) {
          try {
            const url = new URL(streamUrl.startsWith('//') ? `https:${streamUrl}` : streamUrl);
            results.push({
              url,
              meta: {
                countryCodes: [CountryCode.de],
                referer: this.baseUrl,
                title: `${post.title ?? name} (${year})`,
                sourceLabel: this.label,
              },
            });
          } catch {
            // ignore
          }
        }
      }

      return results;
    } catch {
      return [];
    }
  }
}
