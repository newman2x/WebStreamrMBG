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
exports.KinoGer = void 0;
const cheerio = __importStar(require("cheerio"));
const types_1 = require("../types");
const utils_1 = require("../utils");
const Source_1 = require("./Source");
class KinoGer extends Source_1.Source {
    id = 'kinoger';
    label = 'KinoGer';
    contentTypes = ['movie', 'series'];
    countryCodes = [types_1.CountryCode.de];
    baseUrl = 'https://kinoger.com';
    fetcher;
    constructor(fetcher) {
        super();
        this.fetcher = fetcher;
    }
    async handleInternal(ctx, _type, id) {
        const tmdbId = await (0, utils_1.getTmdbId)(ctx, this.fetcher, id);
        const [name, year] = await (0, utils_1.getTmdbNameAndYear)(ctx, this.fetcher, tmdbId, 'de');
        const pageUrl = await this.fetchPageUrl(ctx, name, year);
        if (!pageUrl) {
            return [];
        }
        const title = tmdbId.season ? `${name} ${tmdbId.season}x${tmdbId.episode}` : `${name} (${year})`;
        const seasonIndex = (tmdbId.season ?? 1) - 1;
        const episodeIndex = (tmdbId.episode ?? 1) - 1;
        const html = await this.fetcher.text(ctx, pageUrl);
        return Array.from(html.matchAll(/\.show\(.*/g))
            .map(showJsMatch => this.findEpisodeUrlInShowJs(showJsMatch[0], seasonIndex, episodeIndex))
            .filter((url) => url !== undefined)
            .map(url => ({ url, meta: { countryCodes: [types_1.CountryCode.de], referer: pageUrl.href, title } }));
    }
    ;
    findEpisodeUrlInShowJs = (showJs, seasonIndex, episodeIndex) => {
        let episodeUrl;
        showJs.matchAll(/\[(.*?)]/g).forEach((urlsMatch, season) => {
            if (season !== seasonIndex || !urlsMatch[1]) {
                return;
            }
            const urlMatch = (urlsMatch[1].split(',')[episodeIndex] ?? '').match(/https?:\/\/[^\s'"<>]+/);
            if (!urlMatch) {
                return;
            }
            episodeUrl = new URL(urlMatch[0]);
        });
        return episodeUrl;
    };
    fetchPageUrl = async (ctx, keyword, year) => {
        const searchUrl = new URL(`/?do=search&subaction=search&titleonly=3&story=${encodeURIComponent(keyword)}&x=0&y=0&submit=submit`, this.baseUrl);
        const html = await this.fetcher.text(ctx, searchUrl);
        const $ = cheerio.load(html);
        return $(`.title a:contains("${year}")`)
            .map((_i, el) => new URL($(el).attr('href'), this.baseUrl))
            .get(0);
    };
}
exports.KinoGer = KinoGer;
