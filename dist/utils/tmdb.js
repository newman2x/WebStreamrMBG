"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTmdbNameAndYear = exports.getImdbIdFromTmdbId = exports.getTmdbIdFromImdbId = void 0;
const async_mutex_1 = require("async-mutex");
const error_1 = require("../error");
const env_1 = require("./env");
const id_1 = require("./id");
const mutexes = new Map();
const tmdbFetch = async (ctx, fetcher, path, searchParams) => {
    const config = {
        headers: {
            'Authorization': 'Bearer ' + (0, env_1.envGetRequired)('TMDB_ACCESS_TOKEN'),
            'Content-Type': 'application/json',
        },
        queueLimit: 50,
    };
    const url = new URL(`https://api.themoviedb.org/3${path}`);
    Object.entries(searchParams ?? {}).forEach(([name, value]) => {
        if (value) {
            url.searchParams.set(name, value);
        }
    });
    let mutex = mutexes.get(url.href);
    if (!mutex) {
        mutex = new async_mutex_1.Mutex();
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
const imdbTmdbMap = new Map();
const getTmdbIdFromImdbId = async (ctx, fetcher, imdbId) => {
    // Manual mismatch fixes
    if (imdbId.id === 'tt13207736' && imdbId.season === 2) {
        // Monsters: The Lyle and Erik Menendez Story (2024)
        return new id_1.TmdbId(225634, imdbId.season - 1, imdbId.episode);
    }
    if (imdbId.id === 'tt13207736' && imdbId.season === 3) {
        // Monster: The Ed Gein Story (2025)
        return new id_1.TmdbId(286801, imdbId.season - 2, imdbId.episode);
    }
    if (imdbTmdbMap.has(imdbId.id)) {
        return new id_1.TmdbId(imdbTmdbMap.get(imdbId.id), imdbId.season, imdbId.episode);
    }
    const response = await tmdbFetch(ctx, fetcher, `/find/${imdbId.id}?external_source=imdb_id`);
    const id = (imdbId.season ? response.tv_results[0] : response.movie_results[0])?.id;
    if (!id) {
        throw new error_1.NotFoundError(`Could not get TMDB ID of IMDb ID "${imdbId.id}"`);
    }
    imdbTmdbMap.set(imdbId.id, id);
    return new id_1.TmdbId(id, imdbId.season, imdbId.episode);
};
exports.getTmdbIdFromImdbId = getTmdbIdFromImdbId;
const tmdbImdbMap = new Map();
const getImdbIdFromTmdbId = async (ctx, fetcher, tmdbId) => {
    if (tmdbImdbMap.has(tmdbId.id)) {
        return new id_1.ImdbId(tmdbImdbMap.get(tmdbId.id), tmdbId.season, tmdbId.episode);
    }
    const type = tmdbId.season ? 'tv' : 'movie';
    const response = await tmdbFetch(ctx, fetcher, `/${type}/${tmdbId.id}/external_ids`);
    tmdbImdbMap.set(tmdbId.id, response.imdb_id);
    return new id_1.ImdbId(response.imdb_id, tmdbId.season, tmdbId.episode);
};
exports.getImdbIdFromTmdbId = getImdbIdFromTmdbId;
const getTmdbMovieDetails = async (ctx, fetcher, tmdbId, language) => {
    return await tmdbFetch(ctx, fetcher, `/movie/${tmdbId.id}`, { language });
};
const getTmdbTvDetails = async (ctx, fetcher, tmdbId, language) => {
    return await tmdbFetch(ctx, fetcher, `/tv/${tmdbId.id}`, { language });
};
const getTmdbNameAndYear = async (ctx, fetcher, tmdbId, language) => {
    if (tmdbId.season) {
        const tmdbDetails = await getTmdbTvDetails(ctx, fetcher, tmdbId, language);
        return [tmdbDetails.name, (new Date(tmdbDetails.first_air_date)).getFullYear(), tmdbDetails.original_name];
    }
    const tmdbDetails = await getTmdbMovieDetails(ctx, fetcher, tmdbId, language);
    return [tmdbDetails.title, (new Date(tmdbDetails.release_date)).getFullYear(), tmdbDetails.original_title];
};
exports.getTmdbNameAndYear = getTmdbNameAndYear;
