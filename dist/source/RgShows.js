"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RgShows = void 0;
const types_1 = require("../types");
const utils_1 = require("../utils");
const Source_1 = require("./Source");
class RgShows extends Source_1.Source {
    id = 'rgshows';
    label = 'RgShows';
    useOnlyWithMaxUrlsFound = 1;
    contentTypes = ['movie', 'series'];
    countryCodes = [types_1.CountryCode.multi];
    baseUrl = 'https://rgshows.ru';
    priority = -1;
    fetcher;
    constructor(fetcher) {
        super();
        this.fetcher = fetcher;
    }
    async handleInternal(ctx, _type, id) {
        const tmdbId = await (0, utils_1.getTmdbId)(ctx, this.fetcher, id);
        const [name, year] = await (0, utils_1.getTmdbNameAndYear)(ctx, this.fetcher, tmdbId);
        let title = name;
        if (tmdbId.season) {
            title += ` ${tmdbId.formatSeasonAndEpisode()}`;
        }
        else {
            title += ` (${year})`;
        }
        const url = tmdbId.season
            ? new URL(`https://api.rgshows.ru/main/tv/${tmdbId.id}/${tmdbId.season}/${tmdbId.episode}`, this.baseUrl)
            : new URL(`https://api.rgshows.ru/main/movie/${tmdbId.id}`, this.baseUrl);
        return [{ url, meta: { countryCodes: [types_1.CountryCode.multi], title } }];
    }
    ;
}
exports.RgShows = RgShows;
