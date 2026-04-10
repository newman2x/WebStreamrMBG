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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Kokoshka = void 0;
const cheerio = __importStar(require("cheerio"));
const fast_levenshtein_1 = __importDefault(require("fast-levenshtein"));
const types_1 = require("../types");
const utils_1 = require("../utils");
const Source_1 = require("./Source");
class Kokoshka extends Source_1.Source {
    id = 'kokoshka';
    label = 'Kokoshka';
    contentTypes = ['movie', 'series'];
    countryCodes = [types_1.CountryCode.al];
    baseUrl = 'https://kokoshka.digital';
    fetcher;
    constructor(fetcher) {
        super();
        this.fetcher = fetcher;
    }
    async handleInternal(ctx, _type, id) {
        const tmdbId = await (0, utils_1.getTmdbId)(ctx, this.fetcher, id);
        let pageUrl = await this.fetchPageUrl(ctx, tmdbId, 'sq');
        if (!pageUrl) {
            pageUrl = await this.fetchPageUrl(ctx, tmdbId, 'en');
            if (!pageUrl) {
                return [];
            }
        }
        if (tmdbId.season) {
            pageUrl = await this.fetchEpisodeUrl(ctx, pageUrl, tmdbId);
            if (!pageUrl) {
                return [];
            }
        }
        const pageHtml = await this.fetcher.text(ctx, pageUrl);
        const $ = cheerio.load(pageHtml);
        const title = $('title').first().text().trim();
        return Promise.all($('.dooplay_player_option:not(#player-option-trailer)')
            .map(async (_i, el) => {
            const post = parseInt($(el).attr('data-post'));
            const type = $(el).attr('data-type');
            const nume = parseInt($(el).attr('data-nume'));
            const dooplayerUrl = new URL(`/wp-json/dooplayer/v2/${post}/${type}/${nume}`, this.baseUrl);
            const dooplayerResponse = await this.fetcher.json(ctx, dooplayerUrl, { headers: { Referer: pageUrl.href } });
            return {
                url: new URL(dooplayerResponse.embed_url),
                meta: {
                    countryCodes: [types_1.CountryCode.al],
                    referer: pageUrl.href,
                    title,
                },
            };
        })
            .toArray());
    }
    fetchPageUrl = async (ctx, tmdbId, language) => {
        const [name, year] = await (0, utils_1.getTmdbNameAndYear)(ctx, this.fetcher, tmdbId, language);
        const searchUrl = new URL(`/?s=${encodeURIComponent(`${name.replace(':', '')} ${year}`)}`, this.baseUrl);
        const html = await this.fetcher.text(ctx, searchUrl);
        const $ = cheerio.load(html);
        return $(`.result-item:has(${tmdbId.season ? '.tvshows' : '.movies'})`)
            .filter((_i, el) => {
            const resultItemYear = parseInt($('.year', el).text());
            return Math.abs(resultItemYear - year) <= 1;
        })
            .filter((_i, el) => {
            const resultItemTitle = $('.title', el)
                .text()
                .replace(/\(\d+\).*/, '') // Strip away suffixes like "(2021) me Titra Shqip"
                .trim();
            return fast_levenshtein_1.default.get(resultItemTitle, name, { useCollator: true }) < 3;
        })
            .map((_i, el) => new URL($('a', el).attr('href'), this.baseUrl))
            .get(0);
    };
    async fetchEpisodeUrl(ctx, pageUrl, tmdbId) {
        const html = await this.fetcher.text(ctx, pageUrl);
        const $ = cheerio.load(html);
        return $(`.episodiotitle a[href*="${tmdbId.season}x${tmdbId.episode}"]`)
            .map((_i, el) => new URL($(el).attr('href'), this.baseUrl))
            .get(0);
    }
}
exports.Kokoshka = Kokoshka;
