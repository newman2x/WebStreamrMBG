"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Frembed = void 0;
const memoizee_1 = __importDefault(require("memoizee"));
const types_1 = require("../types");
const utils_1 = require("../utils");
const Source_1 = require("./Source");
class Frembed extends Source_1.Source {
    id = 'frembed';
    label = 'Frembed';
    contentTypes = ['movie', 'series'];
    countryCodes = [types_1.CountryCode.fr];
    baseUrl = 'https://frembed.work';
    fetcher;
    constructor(fetcher) {
        super();
        this.fetcher = fetcher;
        this.getBaseUrl = (0, memoizee_1.default)(this.getBaseUrl, {
            maxAge: 3600000, // 1 hour
            normalizer: () => 'baseUrl',
        });
    }
    async handleInternal(ctx, _type, id) {
        const tmdbId = await (0, utils_1.getTmdbId)(ctx, this.fetcher, id);
        const [, year] = await (0, utils_1.getTmdbNameAndYear)(ctx, this.fetcher, tmdbId);
        const baseUrl = await this.getBaseUrl(ctx);
        const apiUrl = tmdbId.season
            ? new URL(`/api/series?id=${tmdbId.id}&sa=${tmdbId.season}&epi=${tmdbId.episode}&idType=tmdb`, baseUrl)
            : new URL(`/api/films?id=${tmdbId.id}&idType=tmdb`, baseUrl);
        const json = await this.fetcher.json(ctx, apiUrl, { headers: { Referer: baseUrl.origin } });
        const urls = [];
        for (const key in json) {
            if (key.startsWith('link') && json[key] && !json[key].includes(',https')) {
                try {
                    urls.push(await this.fetcher.getFinalRedirectUrl(ctx, new URL(json[key].trim(), baseUrl), { headers: { Referer: baseUrl.origin + '/' } }));
                }
                catch {
                    // Skip invalid URL
                }
            }
        }
        const title = tmdbId.season
            ? `${json['title']} ${tmdbId.formatSeasonAndEpisode()}`
            : `${json['title']} (${year})`;
        return urls.map(url => ({ url, meta: { countryCodes: [types_1.CountryCode.fr], referer: baseUrl.origin, title } }));
    }
    ;
    getBaseUrl = async (ctx) => {
        return await this.fetcher.getFinalRedirectUrl(ctx, new URL(this.baseUrl));
    };
}
exports.Frembed = Frembed;
