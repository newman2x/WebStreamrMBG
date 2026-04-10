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
exports.Cuevana = void 0;
const cheerio = __importStar(require("cheerio"));
const types_1 = require("../types");
const utils_1 = require("../utils");
const Source_1 = require("./Source");
class Cuevana extends Source_1.Source {
    id = 'cuevana';
    label = 'Cuevana';
    contentTypes = ['movie', 'series'];
    countryCodes = [types_1.CountryCode.es, types_1.CountryCode.mx];
    baseUrl = 'https://ww1.cuevana3.is';
    fetcher;
    constructor(fetcher) {
        super();
        this.fetcher = fetcher;
    }
    async handleInternal(ctx, _type, id) {
        const tmdbId = await (0, utils_1.getTmdbId)(ctx, this.fetcher, id);
        const [name, year] = await (0, utils_1.getTmdbNameAndYear)(ctx, this.fetcher, tmdbId, 'es');
        let pageUrl = await this.fetchPageUrl(ctx, name);
        if (!pageUrl) {
            return [];
        }
        let title = name;
        if (tmdbId.season) {
            title += ` ${tmdbId.formatSeasonAndEpisode()}`;
            pageUrl = await this.fetchEpisodeUrl(ctx, pageUrl, tmdbId);
            if (!pageUrl) {
                return [];
            }
        }
        else {
            title += ` (${year})`;
        }
        const html = await this.fetcher.text(ctx, pageUrl);
        const $ = cheerio.load(html);
        const urlResults = $('.open_submenu')
            .map((_i, el) => {
            const elText = $(el).text();
            if (!elText.includes('Español')) {
                return [];
            }
            if (elText.includes('Latino')) {
                return $('[data-tr], [data-video]', el)
                    .map((_i, el) => ({
                    url: new URL($(el).attr('data-tr') ?? $(el).attr('data-video')),
                    meta: { countryCodes: [types_1.CountryCode.mx], referer: pageUrl.href, title },
                }))
                    .toArray();
            }
            return $('[data-tr], [data-video]', el)
                .map((_i, el) => ({
                url: new URL($(el).attr('data-tr') ?? $(el).attr('data-video')),
                meta: { countryCodes: [types_1.CountryCode.es], referer: pageUrl.href, title },
            }))
                .toArray();
        })
            .toArray();
        return Promise.all(urlResults.map(async ({ url, meta }) => {
            if (!url.host.includes('cuevana3')) {
                return { url, meta };
            }
            const html = await this.fetcher.text(ctx, url, { headers: { Referer: pageUrl.origin } });
            const urlMatcher = html.match(/url ?= ?'(.*)'/);
            return { url: new URL(urlMatcher[1]), meta };
        }));
    }
    ;
    async fetchPageUrl(ctx, keyword) {
        const searchUrl = new URL(`/search/${encodeURIComponent(keyword)}/`, this.baseUrl);
        const html = await this.fetcher.text(ctx, searchUrl, { headers: { Referer: searchUrl.origin } });
        const $ = cheerio.load(html);
        const urlPath = $('.TPost .Title')
            .filter((_i, el) => $(el).text().trim() === keyword)
            .closest('a')
            .attr('href');
        return urlPath !== undefined ? new URL(urlPath, searchUrl.origin) : urlPath;
    }
    ;
    async fetchEpisodeUrl(ctx, pageUrl, tmdbId) {
        const html = await this.fetcher.text(ctx, pageUrl, { headers: { Referer: pageUrl.origin } });
        const $ = cheerio.load(html);
        const urlPath = $('.TPost .Year')
            .filter((_i, el) => $(el).text().trim() === `${tmdbId.season}x${tmdbId.episode}`)
            .closest('a')
            .attr('href');
        return urlPath !== undefined ? new URL(urlPath, pageUrl.origin) : urlPath;
    }
}
exports.Cuevana = Cuevana;
