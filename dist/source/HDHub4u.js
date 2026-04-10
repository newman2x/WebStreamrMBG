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
exports.HDHub4u = void 0;
const cheerio = __importStar(require("cheerio"));
const types_1 = require("../types");
const utils_1 = require("../utils");
const hd_hub_helper_1 = require("./hd-hub-helper");
const Source_1 = require("./Source");
class HDHub4u extends Source_1.Source {
    id = 'hdhub4u';
    label = 'HDHub4u';
    contentTypes = ['movie', 'series'];
    countryCodes = [types_1.CountryCode.multi, types_1.CountryCode.gu, types_1.CountryCode.hi, types_1.CountryCode.ml, types_1.CountryCode.pa, types_1.CountryCode.ta, types_1.CountryCode.te];
    baseUrl = 'https://new5.hdhub4u.fo';
    searchUrl = 'https://search.pingora.fyi';
    fetcher;
    constructor(fetcher) {
        super();
        this.fetcher = fetcher;
    }
    async handleInternal(ctx, _type, id) {
        const imdbId = await (0, utils_1.getImdbId)(ctx, this.fetcher, id);
        const pageUrls = await this.fetchPageUrls(ctx, imdbId);
        return (await Promise.all(pageUrls.map(async (pageUrl) => {
            return await this.handlePage(ctx, pageUrl, imdbId);
        }))).flat();
    }
    ;
    handlePage = async (ctx, pageUrl, imdbId) => {
        const html = await this.fetcher.text(ctx, pageUrl);
        const $ = cheerio.load(html);
        const meta = {
            countryCodes: [types_1.CountryCode.multi, ...(0, utils_1.findCountryCodes)($('div:contains("Language"):not(:has(div)):first').text())],
        };
        if (!imdbId.episode) {
            return [
                ...this.extractHubDriveUrlResults(html, meta),
                ...(await Promise.all($('a[href*="gadgetsweb"]').map((_i, el) => this.handleHubLinks(ctx, new URL($(el).attr('href')), pageUrl, meta)))).flat(),
            ];
        }
        return [
            ...(await Promise.all($(`a:contains("EPiSODE ${imdbId.episode}"), a:contains("EPiSODE ${String(imdbId.episode).padStart(2, '0')}")`)
                .map(async (_i, el) => this.handleHubLinks(ctx, new URL($(el).attr('href')), pageUrl, meta)))).flat(),
            ...this.extractHubDriveUrlResults($(`h4:contains("EPiSODE ${imdbId.episode}"), h4:contains("EPiSODE ${String(imdbId.episode).padStart(2, '0')}")`)
                .first()
                .nextUntil('hr')
                .map((_i, el) => $.html(el))
                .get()
                .join(''), meta),
        ];
    };
    handleHubLinks = async (ctx, redirectUrl, refererUrl, meta) => {
        const hubLinksUrl = await (0, hd_hub_helper_1.resolveRedirectUrl)(ctx, this.fetcher, redirectUrl);
        const hubLinksHtml = await this.fetcher.text(ctx, hubLinksUrl, { headers: { Referer: refererUrl.href } });
        return [
            ...this.extractHubDriveUrlResults(hubLinksHtml, { ...meta, referer: hubLinksUrl.href }),
        ];
    };
    extractHubDriveUrlResults = (html, meta) => {
        const $ = cheerio.load(html);
        return $('a[href*="hubdrive"]:not(:contains("⚡"))')
            .map((_i, el) => ({ url: new URL($(el).attr('href')), meta }))
            .toArray();
    };
    fetchPageUrls = async (ctx, imdbId) => {
        const searchUrl = new URL(`/collections/post/documents/search?query_by=imdb_id&q=${encodeURIComponent(imdbId.id)}`, this.searchUrl);
        const searchResponse = await this.fetcher.json(ctx, searchUrl, { headers: { Referer: this.baseUrl } });
        return searchResponse.hits
            .filter(hit => hit.document.imdb_id === imdbId.id
            && (!imdbId.season
                || hit.document.post_title.includes(`Season ${imdbId.season}`)
                || hit.document.post_title.includes(`S${String(imdbId.season)}`)
                || hit.document.post_title.includes(`S${String(imdbId.season).padStart(2, '0')}`)))
            .map(hit => new URL(hit.document.permalink, this.baseUrl));
    };
}
exports.HDHub4u = HDHub4u;
