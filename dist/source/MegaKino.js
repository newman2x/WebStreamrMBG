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
exports.MegaKino = void 0;
const cheerio = __importStar(require("cheerio"));
const memoizee_1 = __importDefault(require("memoizee"));
const tough_cookie_1 = require("tough-cookie");
const types_1 = require("../types");
const utils_1 = require("../utils");
const Source_1 = require("./Source");
class MegaKino extends Source_1.Source {
    id = 'megakino';
    label = 'MegaKino';
    contentTypes = ['movie'];
    countryCodes = [types_1.CountryCode.de];
    baseUrl = 'https://megakino1.to';
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
        const imdbId = await (0, utils_1.getImdbId)(ctx, this.fetcher, id);
        const tokenResponse = await this.fetcher.fetch(ctx, new URL('/?yg=token', await this.getBaseUrl(ctx)), { method: 'HEAD' });
        const cookie = tough_cookie_1.Cookie.parse(tokenResponse.headers['set-cookie'][0]);
        const pageUrl = await this.fetchPageUrl(ctx, imdbId, cookie);
        if (!pageUrl) {
            return [];
        }
        const html = await this.fetcher.text(ctx, pageUrl, { headers: { Cookie: cookie.cookieString() } });
        const $ = cheerio.load(html);
        const title = $('meta[property="og:title"]').attr('content')?.trim();
        return Promise.all($(`.video-inside iframe`)
            .map((_i, el) => new URL(($(el).attr('data-src') ?? $(el).attr('src'))))
            .toArray()
            .map(url => ({ url, meta: { countryCodes: [types_1.CountryCode.de], referer: pageUrl.href, title } })));
    }
    ;
    fetchPageUrl = async (ctx, imdbId, cookie) => {
        const form = new URLSearchParams();
        form.append('do', 'search');
        form.append('subaction', 'search');
        form.append('story', `${imdbId.id}`);
        const postUrl = await this.getBaseUrl(ctx);
        const html = await this.fetcher.textPost(ctx, postUrl, form.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': postUrl.origin,
                'Cookie': cookie.cookieString(),
            },
        });
        const $ = cheerio.load(html);
        return $('#dle-content a[href].poster:first')
            .map(async (_i, el) => new URL($(el).attr('href'), await this.getBaseUrl(ctx)))
            .get(0);
    };
    getBaseUrl = async (ctx) => {
        return await this.fetcher.getFinalRedirectUrl(ctx, new URL(this.baseUrl));
    };
}
exports.MegaKino = MegaKino;
