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
exports.FourKHDHub = void 0;
const bytes_1 = __importDefault(require("bytes"));
const cheerio = __importStar(require("cheerio"));
const fast_levenshtein_1 = __importDefault(require("fast-levenshtein"));
const memoizee_1 = __importDefault(require("memoizee"));
const types_1 = require("../types");
const utils_1 = require("../utils");
const hd_hub_helper_1 = require("./hd-hub-helper");
const Source_1 = require("./Source");
class FourKHDHub extends Source_1.Source {
    id = '4khdhub';
    label = '4KHDHub';
    contentTypes = ['movie', 'series'];
    countryCodes = [types_1.CountryCode.multi, types_1.CountryCode.hi, types_1.CountryCode.ta, types_1.CountryCode.te];
    baseUrl = 'https://4khdhub.dad';
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
        const pageUrl = await this.fetchPageUrl(ctx, tmdbId);
        if (!pageUrl) {
            return [];
        }
        const html = await this.fetcher.text(ctx, pageUrl);
        const $ = cheerio.load(html);
        if (tmdbId.season) {
            return Promise.all($(`.episode-item`)
                .filter((_i, el) => $('.episode-title', el).text().includes(`S${String(tmdbId.season).padStart(2, '0')}`))
                .map((_i, el) => ({
                countryCodes: [types_1.CountryCode.multi, ...(0, utils_1.findCountryCodes)($(el).html())],
                downloadItem: $('.episode-download-item', el)
                    .filter((_i, el) => $(el).text().includes(`Episode-${String(tmdbId.episode).padStart(2, '0')}`))
                    .get(0),
            })).filter((_i, { downloadItem }) => downloadItem !== undefined)
                .map(async (_id, { countryCodes, downloadItem }) => await this.extractSourceResults(ctx, $, downloadItem, countryCodes))
                .toArray());
        }
        return Promise.all($(`.download-item`)
            .map(async (_i, el) => await this.extractSourceResults(ctx, $, el, [types_1.CountryCode.multi, ...(0, utils_1.findCountryCodes)($(el).html())]))
            .toArray());
    }
    ;
    fetchPageUrl = async (ctx, tmdbId) => {
        const [name, year] = await (0, utils_1.getTmdbNameAndYear)(ctx, this.fetcher, tmdbId);
        const searchUrl = new URL(`/?s=${encodeURIComponent(name)}`, await this.getBaseUrl(ctx));
        const html = await this.fetcher.text(ctx, searchUrl);
        const $ = cheerio.load(html);
        return $(`.movie-card:has(.movie-card-format:contains("${tmdbId.season ? 'Series' : 'Movies'}"))`)
            .filter((_i, el) => {
            const movieCardYear = parseInt($('.movie-card-meta', el).text());
            return Math.abs(movieCardYear - year) <= 1;
        })
            .filter((_i, el) => {
            const movieCardTitle = $('.movie-card-title', el)
                .text()
                .replace(/\[.*?]/, '')
                .trim();
            const diff = fast_levenshtein_1.default.get(movieCardTitle, name, { useCollator: true });
            return diff < 5
                || (movieCardTitle.includes(name) && diff < 16);
        })
            .map(async (_i, el) => new URL($(el).attr('href'), await this.getBaseUrl(ctx)))
            .get(0);
    };
    extractSourceResults = async (ctx, $, el, countryCodes) => {
        const localHtml = $(el).html();
        const sizeMatch = localHtml.match(/([\d.]+ ?[GM]B)/);
        const heightMatch = localHtml.match(/\d{3,}p/);
        const meta = {
            countryCodes: [...new Set([...countryCodes, ...(0, utils_1.findCountryCodes)(localHtml)])],
            height: parseInt(heightMatch[0]),
            title: $('.file-title, .episode-file-title', el).text().trim(),
            ...(sizeMatch && { bytes: bytes_1.default.parse(sizeMatch[1]) }),
        };
        const redirectUrlHubCloud = $('a', el)
            .filter((_i, el) => $(el).text().includes('HubCloud'))
            .map((_i, el) => new URL($(el).attr('href')))
            .get(0);
        if (redirectUrlHubCloud) {
            return { url: await (0, hd_hub_helper_1.resolveRedirectUrl)(ctx, this.fetcher, redirectUrlHubCloud), meta };
        }
        const redirectUrlHubDrive = $('a', el)
            .filter((_i, el) => $(el).text().includes('HubDrive'))
            .map((_i, el) => new URL($(el).attr('href')))
            .get(0);
        return { url: await (0, hd_hub_helper_1.resolveRedirectUrl)(ctx, this.fetcher, redirectUrlHubDrive), meta };
    };
    getBaseUrl = async (ctx) => {
        return await this.fetcher.getFinalRedirectUrl(ctx, new URL(this.baseUrl));
    };
}
exports.FourKHDHub = FourKHDHub;
