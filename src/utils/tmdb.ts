import { Mutex } from 'async-mutex';
import { NotFoundError } from '../error';
import { Context } from '../types';
import { envGet } from './env';
import { CustomRequestConfig, Fetcher } from './Fetcher';
import { ImdbId, TmdbId } from './id';

interface FindResponsePartial {
  movie_results: {
    id: number;
  }[];
  tv_results: {
    id: number;
  }[];
}

interface ExternalIdsResponsePartial {
  imdb_id: string;
}

interface MovieDetailsResponsePartial {
  original_title: string;
  release_date: string;
  title: string;
}

interface TvDetailsResponsePartial {
  first_air_date: string;
  name: string;
  original_name: string;
}

interface ImdbSuggestionItem {
  id: string;
  l: string;
  y?: number;
  q?: string;
}

const imdbDetailsMap = new Map<string, [string, number, string]>();
const syntheticTmdbMap = new Map<number, string>();

async function getImdbDetailsFromSuggestionApi(ctx: Context, fetcher: Fetcher, imdbIdStr: string): Promise<[string, number, string]> {
  const cached = imdbDetailsMap.get(imdbIdStr);
  if (cached) {
    return cached;
  }

  const url = new URL(`https://v3.sg.media-imdb.com/suggestion/t/${imdbIdStr}.json`);
  const data = await fetcher.json(ctx, url) as { d?: ImdbSuggestionItem[] };
  const item = data.d?.find(i => i.id === imdbIdStr) ?? data.d?.[0];
  if (!item || !item.l) {
    throw new NotFoundError(`Could not get IMDb details for "${imdbIdStr}"`);
  }

  const details: [string, number, string] = [item.l, item.y ?? 2020, item.l];
  imdbDetailsMap.set(imdbIdStr, details);
  return details;
}

function hashImdbIdToNumber(imdbIdStr: string): number {
  let hash = 0;
  for (let i = 0; i < imdbIdStr.length; i++) {
    hash = (hash << 5) - hash + imdbIdStr.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) + 9000000;
}

const mutexes = new Map<string, Mutex>();
const tmdbFetch = async (ctx: Context, fetcher: Fetcher, path: string, searchParams?: Record<string, string | undefined>): Promise<unknown> => {
  const token = envGet('TMDB_ACCESS_TOKEN') || envGet('TMDB_API_KEY');
  if (!token) {
    throw new NotFoundError('TMDB_ACCESS_TOKEN or TMDB_API_KEY is not configured');
  }

  const config: CustomRequestConfig = {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    queueLimit: 50,
  };

  const url = new URL(`https://api.themoviedb.org/3${path}`);

  if (!token.startsWith('eyJ') && !token.includes(' ')) {
    url.searchParams.set('api_key', token);
  }

  Object.entries(searchParams ?? {}).forEach(([name, value]) => {
    if (value) {
      url.searchParams.set(name, value);
    }
  });

  let mutex = mutexes.get(url.href);
  if (!mutex) {
    mutex = new Mutex();
    mutexes.set(url.href, mutex);
  }

  const data = await mutex.runExclusive(async () => {
    return await fetcher.json(ctx, url, config);
  });

  if (!mutex.isLocked()) {
    mutexes.delete(url.href);
  }

  return data;
};

const imdbTmdbMap = new Map<string, number>();
export const getTmdbIdFromImdbId = async (ctx: Context, fetcher: Fetcher, imdbId: ImdbId): Promise<TmdbId> => {
  // Manual mismatch fixes
  if (imdbId.id === 'tt13207736' && imdbId.season === 2) {
    // Monsters: The Lyle and Erik Menendez Story (2024)
    return new TmdbId(225634, imdbId.season - 1, imdbId.episode);
  }
  if (imdbId.id === 'tt13207736' && imdbId.season === 3) {
    // Monster: The Ed Gein Story (2025)
    return new TmdbId(286801, imdbId.season - 2, imdbId.episode);
  }

  if (imdbTmdbMap.has(imdbId.id)) {
    return new TmdbId(imdbTmdbMap.get(imdbId.id) as number, imdbId.season, imdbId.episode);
  }

  let tmdbErr: unknown;
  try {
    const response = await tmdbFetch(ctx, fetcher, `/find/${imdbId.id}?external_source=imdb_id`) as FindResponsePartial;
    const id = (imdbId.season ? response.tv_results[0] : response.movie_results[0])?.id;

    if (id) {
      imdbTmdbMap.set(imdbId.id, id);
      tmdbImdbMap.set(id, imdbId.id);
      return new TmdbId(id, imdbId.season, imdbId.episode);
    }
  } catch (error) {
    tmdbErr = error;
  }

  try {
    const [title, year] = await getImdbDetailsFromSuggestionApi(ctx, fetcher, imdbId.id);
    const syntheticId = hashImdbIdToNumber(imdbId.id);
    imdbTmdbMap.set(imdbId.id, syntheticId);
    syntheticTmdbMap.set(syntheticId, imdbId.id);
    imdbDetailsMap.set(imdbId.id, [title, year, title]);
    return new TmdbId(syntheticId, imdbId.season, imdbId.episode);
  } catch {
    if (tmdbErr) {
      throw tmdbErr;
    }
    throw new NotFoundError(`Could not get TMDB ID of IMDb ID "${imdbId.id}"`);
  }
};

const tmdbImdbMap = new Map<number, string>();
export const getImdbIdFromTmdbId = async (ctx: Context, fetcher: Fetcher, tmdbId: TmdbId): Promise<ImdbId> => {
  if (tmdbImdbMap.has(tmdbId.id)) {
    return new ImdbId(tmdbImdbMap.get(tmdbId.id) as string, tmdbId.season, tmdbId.episode);
  }
  const syntheticImdbId = syntheticTmdbMap.get(tmdbId.id);
  if (syntheticImdbId) {
    return new ImdbId(syntheticImdbId, tmdbId.season, tmdbId.episode);
  }

  const type = tmdbId.season ? 'tv' : 'movie';

  const response = await tmdbFetch(ctx, fetcher, `/${type}/${tmdbId.id}/external_ids`) as ExternalIdsResponsePartial;

  tmdbImdbMap.set(tmdbId.id, response.imdb_id);
  return new ImdbId(response.imdb_id, tmdbId.season, tmdbId.episode);
};

const getTmdbMovieDetails = async (ctx: Context, fetcher: Fetcher, tmdbId: TmdbId, language?: string): Promise<MovieDetailsResponsePartial> => {
  return await tmdbFetch(ctx, fetcher, `/movie/${tmdbId.id}`, { language }) as MovieDetailsResponsePartial;
};

const getTmdbTvDetails = async (ctx: Context, fetcher: Fetcher, tmdbId: TmdbId, language?: string): Promise<TvDetailsResponsePartial> => {
  return await tmdbFetch(ctx, fetcher, `/tv/${tmdbId.id}`, { language }) as TvDetailsResponsePartial;
};

export const getTmdbNameAndYear = async (ctx: Context, fetcher: Fetcher, tmdbId: TmdbId, language?: string): Promise<[string, number, string]> => {
  const imdbIdStr = syntheticTmdbMap.get(tmdbId.id) ?? tmdbImdbMap.get(tmdbId.id);
  if (imdbIdStr) {
    const cachedDetails = imdbDetailsMap.get(imdbIdStr);
    if (cachedDetails) {
      return cachedDetails;
    }
  }

  try {
    if (tmdbId.season) {
      const tmdbDetails = await getTmdbTvDetails(ctx, fetcher, tmdbId, language);
      return [tmdbDetails.name, (new Date(tmdbDetails.first_air_date)).getFullYear(), tmdbDetails.original_name];
    }

    const tmdbDetails = await getTmdbMovieDetails(ctx, fetcher, tmdbId, language);
    return [tmdbDetails.title, (new Date(tmdbDetails.release_date)).getFullYear(), tmdbDetails.original_title];
  } catch {
    if (imdbIdStr) {
      return await getImdbDetailsFromSuggestionApi(ctx, fetcher, imdbIdStr);
    }
    throw new NotFoundError(`Could not get TMDB or IMDb details for TMDB ID ${tmdbId.id}`);
  }
};
