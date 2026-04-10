"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Movix = void 0;
const types_1 = require("../types");
const utils_1 = require("../utils");
const Source_1 = require("./Source");
class Movix extends Source_1.Source {
    id = 'movix';
    label = 'Movix';
    contentTypes = ['movie', 'series'];
    countryCodes = [types_1.CountryCode.fr];
    baseUrl = 'https://api.movix.site';
    fetcher;
    constructor(fetcher) {
        super();
        this.fetcher = fetcher;
    }
    async handleInternal(ctx, _type, id) {
        const tmdbId = await (0, utils_1.getTmdbId)(ctx, this.fetcher, id);
        const [, year] = await (0, utils_1.getTmdbNameAndYear)(ctx, this.fetcher, tmdbId);
        const apiUrl = tmdbId.season
            ? new URL(`/api/tmdb/tv/${tmdbId.id}?season=${tmdbId.season}&episode=${tmdbId.episode}`, this.baseUrl)
            : new URL(`/api/tmdb/movie/${tmdbId.id}`, this.baseUrl);
        const json = await this.fetcher.json(ctx, apiUrl);
        const data = tmdbId.season ? json['current_episode'] : json;
        if (!data || !data.player_links) {
            return [];
        }
        const urls = data['player_links'].map(({ decoded_url }) => new URL(decoded_url));
        const title = tmdbId.season
            ? `${json['tmdb_details']['title']} ${tmdbId.formatSeasonAndEpisode()}`
            : `${json['tmdb_details']['title']} (${year})`;
        return urls.map(url => ({ url, meta: { countryCodes: [types_1.CountryCode.fr], referer: data.iframe_src, title } }));
    }
    ;
}
exports.Movix = Movix;
