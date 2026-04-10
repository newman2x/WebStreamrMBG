"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CineHDPlus = void 0;
const cheerio = __importStar(require("cheerio"));
const types_1 = require("../types");
const utils_1 = require("../utils");
const Source_1 = require("./Source");
class CineHDPlus extends Source_1.Source {
    id = 'cinehdplus';
    label = 'CineHDPlus';
    contentTypes = ['series'];
    countryCodes = [types_1.CountryCode.es, types_1.CountryCode.mx];
    baseUrl = 'https://cinehdplus.gratis';
    fetcher;
    constructor(fetcher) {
        super();
        this.fetcher = fetcher;
    }
    async handleInternal(ctx, _type, id) {
        const tmdbId = await (0, utils_1.getTmdbId)(ctx, this.fetcher, id);
        const seriesPageUrl = await this.fetchSeriesPageUrl(ctx, tmdbId);
        if (!seriesPageUrl) {
            return [];
        }
        const html = await this.fetcher.text(ctx, seriesPageUrl);
        const $ = cheerio.load(html);
        const countryCodes = [$('.details__langs').html().includes('Latino') ? types_1.CountryCode.mx : types_1.CountryCode.es];
        const title = `${$('meta[property="og:title"]').attr('content').trim()} ${tmdbId.formatSeasonAndEpisode()}`;
        return Promise.all($(`[data-num="${tmdbId.season}x${tmdbId.episode}"]`)
            .siblings('.mirrors')
            .children('[data-link]')
            .map((_i, el) => new URL($(el).attr('data-link').replace(/^(https:)?\/\//, 'https://')))
            .toArray()
            .filter(url => !url.host.match(/cinehdplus/))
            .map(url => ({ url, meta: { countryCodes, referer: seriesPageUrl.href, title } })));
    }
    ;
    fetchSeriesPageUrl = async (ctx, tmdbId) => {
        const html = await this.fetcher.text(ctx, new URL(`/series/?story=${tmdbId.id}&do=search&subaction=search`, this.baseUrl));
        const $ = cheerio.load(html);
        const url = $('.card__title a[href]:first')
            .map((_i, el) => $(el).attr('href'))
            .get(0);
        return url !== undefined ? new URL(url) : url;
    };
}
exports.CineHDPlus = CineHDPlus;
