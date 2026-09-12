import { load } from 'cheerio';
import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode } from '../types';
import { Fetcher, getTmdbId, getTmdbNameAndYear, Id } from '../utils';
import { Source, SourceResult } from './Source';

export class BurningSeries extends Source {
  public readonly id = 'burningseries';

  public readonly label = 'BurningSeries';

  public override readonly contentTypes: ContentType[] = ['series' as ContentType];

  public override readonly countryCodes: CountryCode[] = [CountryCode.de];

  public override readonly baseUrl = 'https://bs.to';

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

    const [name] = await getTmdbNameAndYear(ctx, this.fetcher, tmdbId, 'de');
    const season = tmdbId.season;
    const episode = tmdbId.episode ?? 1;

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const episodePageUrl = new URL(`/serie/${slug}/${season}/${episode}`, this.baseUrl);
    const title = `${name} ${tmdbId.formatSeasonAndEpisode()}`;

    try {
      const pageBody = await this.fetcher.text(ctx, episodePageUrl);
      const $ = load(pageBody);
      const results: SourceResult[] = [];

      $('.hoster-tabs a, .hosters a, ul.hoster-list a').each((_i, el) => {
        const href = $(el).attr('href');
        const hosterName = $(el).text().trim() || 'Hoster';

        if (href && !href.startsWith('javascript')) {
          const fullUrl = href.startsWith('http') ? new URL(href) : new URL(href, this.baseUrl);
          results.push({
            url: fullUrl,
            meta: {
              countryCodes: [CountryCode.de],
              referer: episodePageUrl.href,
              title: `${hosterName} - ${title}`,
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
}
