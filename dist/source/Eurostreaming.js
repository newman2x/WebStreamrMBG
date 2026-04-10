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
exports.Eurostreaming = void 0;
const cheerio = __importStar(require("cheerio"));
const fast_levenshtein_1 = __importDefault(require("fast-levenshtein"));
const types_1 = require("../types");
const utils_1 = require("../utils");
const Source_1 = require("./Source");
class Eurostreaming extends Source_1.Source {
    id = 'eurostreaming';
    label = 'Eurostreaming';
    contentTypes = ['series'];
    countryCodes = [types_1.CountryCode.it];
    baseUrl = 'https://eurostreaming.luxe';
    fetcher;
    constructor(fetcher) {
        super();
        this.fetcher = fetcher;
    }
    async handleInternal(ctx, _type, id) {
        const tmdbId = await (0, utils_1.getTmdbId)(ctx, this.fetcher, id);
        const [name] = await (0, utils_1.getTmdbNameAndYear)(ctx, this.fetcher, tmdbId, 'it');
        const seriesPageUrl = await this.fetchSeriesPageUrl(ctx, name.replace(':', '').replace('-', ''));
        if (!seriesPageUrl) {
            return [];
        }
        const html = await this.fetcher.text(ctx, seriesPageUrl);
        const $ = cheerio.load(html);
        const title = `${name} ${tmdbId.formatSeasonAndEpisode()}`;
        return Promise.all($(`[data-num="${tmdbId.season}x${tmdbId.episode}"]`)
            .siblings('.mirrors')
            .children('[data-link!="#"]')
            .map((_i, el) => new URL($(el).attr('data-link')))
            .toArray()
            .filter(url => !url.host.match(/eurostreaming/))
            .map(url => ({ url, meta: { countryCodes: [types_1.CountryCode.it], referer: seriesPageUrl.href, title } })));
    }
    ;
    fetchSeriesPageUrl = async (ctx, keyword) => {
        const postUrl = new URL('/index.php?do=search', this.baseUrl);
        const form = new URLSearchParams();
        form.append('subaction', 'search');
        form.append('story', keyword);
        const html = await this.fetcher.textPost(ctx, postUrl, form.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': postUrl.origin,
            },
        });
        const $ = cheerio.load(html);
        const exactKeyWordMatchUrl = $(`.post-thumb a[href][title="${keyword}"]:first`)
            .map((_i, el) => new URL($(el).attr('href')))
            .get(0);
        const similarKeyWordMatchUrl = $(`.post-thumb a[href]:first`)
            .filter((_i, el) => fast_levenshtein_1.default.get($(el).attr('title').trim(), keyword, { useCollator: true }) < 5)
            .map((_i, el) => new URL($(el).attr('href')))
            .get(0);
        const partialKeyWordMatchUrl = $(`.post-thumb a[href][title*="${keyword}"]:first`)
            .map((_i, el) => new URL($(el).attr('href')))
            .get(0);
        return exactKeyWordMatchUrl ?? similarKeyWordMatchUrl ?? partialKeyWordMatchUrl;
    };
}
exports.Eurostreaming = Eurostreaming;
