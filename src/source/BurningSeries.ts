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

  private readonly fallbackDomains = [
    'https://bs.to',
    'https://burningseries.ac',
    'https://bs.cine.to',
    'https://serienstream.to',
  ];

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

    const title = `${name} ${tmdbId.formatSeasonAndEpisode()}`;

    for (const domainCandidate of this.fallbackDomains) {
      try {
        const isSStream = domainCandidate.includes('serienstream');
        const episodePagePath = isSStream
          ? `/serie/stream/${slug}/staffel-${season}/episode-${episode}`
          : `/serie/${slug}/${season}/${episode}`;

        const episodePageUrl = new URL(episodePagePath, domainCandidate);
        const pageBody = await this.fetcher.text(ctx, episodePageUrl);
        const $ = load(pageBody);
        const results: SourceResult[] = [];

        const selector = isSStream
          ? 'a[href*="/redirect/"], button[data-play-url]'
          : '.hoster-tabs a, .hosters a, ul.hoster-list a, a[href*="/out/"]';

        $(selector).each((_i, el) => {
          const href = $(el).attr('data-play-url') ?? $(el).attr('href');
          const hosterName = $(el).text().trim() || $(el).attr('title') || 'Hoster';

          if (href && !href.startsWith('javascript')) {
            const fullUrl = href.startsWith('http') ? new URL(href) : new URL(href, domainCandidate);
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

        if (results.length > 0) {
          return results;
        }
      } catch {
        // try next fallback domain candidate
      }
    }

    return [];
  }
}
