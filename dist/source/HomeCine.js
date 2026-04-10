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
exports.HomeCine = void 0;
const cheerio = __importStar(require("cheerio"));
const fast_levenshtein_1 = __importDefault(require("fast-levenshtein"));
const types_1 = require("../types");
const utils_1 = require("../utils");
const Source_1 = require("./Source");
class HomeCine extends Source_1.Source {
    id = 'homecine';
    label = 'HomeCine';
    contentTypes = ['movie', 'series'];
    countryCodes = [types_1.CountryCode.es, types_1.CountryCode.mx];
    baseUrl = 'https://www3.homecine.to';
    fetcher;
    constructor(fetcher) {
        super();
        this.fetcher = fetcher;
    }
    async handleInternal(ctx, _type, id) {
        const tmdbId = await (0, utils_1.getTmdbId)(ctx, this.fetcher, id);
        const [name, year, originalName] = await (0, utils_1.getTmdbNameAndYear)(ctx, this.fetcher, tmdbId, 'es');
        let pageUrl = await this.fetchPageUrl(ctx, name, tmdbId);
        if (!pageUrl) {
            pageUrl = await this.fetchPageUrl(ctx, originalName, tmdbId);
            if (!pageUrl) {
                return [];
            }
        }
        let pageHtml = await this.fetcher.text(ctx, pageUrl);
        if (tmdbId.season) {
            const pageUrl = await this.fetchEpisodeUrl(pageHtml, tmdbId);
            if (!pageUrl) {
                return [];
            }
            pageHtml = await this.fetcher.text(ctx, pageUrl);
        }
        const title = tmdbId.season ? `${name} ${tmdbId.formatSeasonAndEpisode()}` : `${name} (${year})`;
        const $ = cheerio.load(pageHtml);
        return $('.les-content a')
            .map((_i, el) => {
            let countryCodes;
            if ($(el).text().toLowerCase().includes('latino')) {
                countryCodes = [types_1.CountryCode.mx];
            }
            else if ($(el).text().toLowerCase().includes('castellano')) {
                countryCodes = [types_1.CountryCode.es];
            }
            else {
                return [];
            }
            return { url: new URL($('iframe', $(el).attr('href')).attr('src')), meta: { countryCodes, referer: pageUrl.href, title } };
        }).toArray();
    }
    ;
    fetchPageUrl = async (ctx, name, tmdbId) => {
        const searchUrl = new URL(`/?s=${encodeURIComponent(name)}`, this.baseUrl);
        const html = await this.fetcher.text(ctx, searchUrl);
        const $ = cheerio.load(html);
        const keywords = [...new Set([
                name,
                name.replace('-', '–'),
            ])];
        const urls = [];
        // exact match
        keywords.map((keyword) => {
            urls.push(...$(`a[oldtitle="${keyword}"]`)
                .map((_i, el) => new URL($(el).attr('href')))
                .toArray()
                .filter(url => tmdbId.season ? url.href.includes('/series/') : !url.href.includes('/series/')));
        });
        // similar match
        keywords.map((keyword) => {
            urls.push(...$(`a[oldtitle]`)
                .filter((_i, el) => fast_levenshtein_1.default.get($(el).attr('oldtitle').trim(), keyword, { useCollator: true }) < 5)
                .map((_i, el) => new URL($(el).attr('href')))
                .toArray()
                .filter(url => tmdbId.season ? url.href.includes('/series/') : !url.href.includes('/series/')));
        });
        return urls[0];
    };
    fetchEpisodeUrl = async (pageHtml, tmdbId) => {
        const $ = cheerio.load(pageHtml);
        const urls = $('#seasons a')
            .map((_i, el) => new URL($(el).attr('href')))
            .toArray()
            .filter(url => url.href.endsWith(`-temporada-${tmdbId.season}-capitulo-${tmdbId.episode}`));
        return urls[0];
    };
}
exports.HomeCine = HomeCine;
