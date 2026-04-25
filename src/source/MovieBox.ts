import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode } from '../types';
import { Fetcher, getTmdbId, getTmdbNameAndYear, Id } from '../utils';
import { Source, SourceResult } from './Source';

interface MovieBoxSearchItem {
  subjectId: string;
  subjectType: number;
  title: string;
  detailPath: string;
  releaseDate?: string;
  hasResource?: boolean;
  season?: number;
}

interface MovieBoxSearchData {
  items: MovieBoxSearchItem[];
  pager: {
    hasMore: boolean;
    nextPage: string;
    page: string;
    perPage: number;
    totalCount: number;
  };
}

interface MovieBoxSearchResponse {
  code: number;
  message: string;
  data: MovieBoxSearchData;
}

const SEARCH_PATH = '/wefeed-h5api-bff/subject/search';
const DOWNLOAD_PATH = '/wefeed-h5api-bff/subject/download';

const SUBJECT_TYPE_MOVIE = 1;
const SUBJECT_TYPE_TV = 2;

function stripSeasonSuffix(title: string): string {
  // Strip " S{n}" suffix, e.g. "Breaking Bad S1" → "Breaking Bad"
  return title.replace(/\s+S\d+$/, '');
}

export class MovieBox extends Source {
  public readonly id = 'moviebox';

  public readonly label = 'MovieBox';

  public readonly contentTypes: ContentType[] = ['movie', 'series'];

  public readonly countryCodes: CountryCode[] = [CountryCode.multi];

  public readonly baseUrl = 'https://moviebox.ph';

  public override readonly priority = -1;

  private readonly apiBaseUrl = 'https://h5-api.aoneroom.com';

  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();

    this.fetcher = fetcher;
  }

  public async handleInternal(ctx: Context, _type: ContentType, id: Id): Promise<SourceResult[]> {
    const tmdbId = await getTmdbId(ctx, this.fetcher, id);
    const [name, year] = await getTmdbNameAndYear(ctx, this.fetcher, tmdbId);

    const subjectType = tmdbId.season ? SUBJECT_TYPE_TV : SUBJECT_TYPE_MOVIE;

    const searchResult = await this.searchMovieBox(ctx, name, year, subjectType, tmdbId.season ?? 0);
    if (!searchResult) {
      return [];
    }

    const { subjectId, detailPath } = searchResult;

    const se = tmdbId.season ?? 0;
    const ep = tmdbId.episode ?? 0;

    const downloadUrl = new URL(`${this.apiBaseUrl}${DOWNLOAD_PATH}`);
    downloadUrl.searchParams.set('subjectId', subjectId);
    downloadUrl.searchParams.set('se', String(se));
    downloadUrl.searchParams.set('ep', String(ep));
    downloadUrl.searchParams.set('detailPath', detailPath);

    let title = name;
    if (tmdbId.season) {
      title += ` ${tmdbId.formatSeasonAndEpisode()}`;
    } else {
      title += ` (${year})`;
    }

    return [{
      url: downloadUrl,
      meta: {
        countryCodes: [CountryCode.multi],
        referer: 'https://videodownloader.site/',
        title,
      },
    }];
  }

  private async searchMovieBox(ctx: Context, name: string, year: number, subjectType: number, season: number): Promise<{ subjectId: string; detailPath: string } | null> {
    const searchUrl = new URL(`${this.apiBaseUrl}${SEARCH_PATH}`);

    const payload = JSON.stringify({
      keyword: name,
      page: 1,
      perPage: 24,
      subjectType,
    });

    const responseText = await this.fetcher.textPost(
      ctx,
      searchUrl,
      payload,
      {
        headers: {
          ...this.getApiHeaders(),
          'Content-Type': 'application/json',
        },
      },
    );

    const response = JSON.parse(responseText) as MovieBoxSearchResponse;

    if (response.code !== 0 || !response.data?.items?.length) {
      return null;
    }

    const items = response.data.items;

    if (subjectType === SUBJECT_TYPE_MOVIE) {
      return this.matchMovie(items, name, year);
    }

    return this.matchTv(items, name, season);
  }

  private matchMovie(items: MovieBoxSearchItem[], name: string, year: number): { subjectId: string; detailPath: string } | null {
    const yearStr = String(year);

    // Try exact match by title and year
    const exactMatch = items.find((item) => {
      const titleMatch = item.title?.toLowerCase() === name.toLowerCase();
      const yearMatch = !item.releaseDate || item.releaseDate.startsWith(yearStr);
      return titleMatch && yearMatch && item.hasResource;
    });

    if (exactMatch) {
      return { subjectId: exactMatch.subjectId, detailPath: exactMatch.detailPath };
    }

    // Fallback: first item with resources
    const firstWithResource = items.find(item => item.hasResource);
    if (firstWithResource) {
      return { subjectId: firstWithResource.subjectId, detailPath: firstWithResource.detailPath };
    }

    return null;
  }

  private matchTv(items: MovieBoxSearchItem[], name: string, season: number): { subjectId: string; detailPath: string } | null {
    // For TV, items come as "Breaking Bad S1", "Breaking Bad S2", etc.
    // Filter items where the base title matches (strip the " S{n}" suffix)
    const matchingItems = items.filter((item) => {
      const baseTitle = stripSeasonSuffix(item.title);
      return baseTitle.toLowerCase() === name.toLowerCase();
    });

    if (matchingItems.length === 0) {
      // Fallback: first item with resources from all items
      const firstWithResource = items.find(item => item.hasResource);
      if (firstWithResource) {
        return { subjectId: firstWithResource.subjectId, detailPath: firstWithResource.detailPath };
      }
      return null;
    }

    // Try to find exact season match
    const seasonMatch = matchingItems.find(item => item.season === season && item.hasResource);
    if (seasonMatch) {
      return { subjectId: seasonMatch.subjectId, detailPath: seasonMatch.detailPath };
    }

    // Fallback: first matching item with resources
    const firstWithResource = matchingItems.find(item => item.hasResource);
    if (firstWithResource) {
      return { subjectId: firstWithResource.subjectId, detailPath: firstWithResource.detailPath };
    }

    return null;
  }

  private getApiHeaders(): Record<string, string> {
    return {
      'Accept': 'application/json',
      'X-Client-Info': '{"timezone":"UTC"}',
      'Referer': 'https://videodownloader.site/',
    };
  }
}
