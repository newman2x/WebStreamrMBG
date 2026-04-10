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
exports.VidSrc = void 0;
const cheerio = __importStar(require("cheerio"));
const error_1 = require("../error");
const types_1 = require("../types");
const utils_1 = require("../utils");
const Extractor_1 = require("./Extractor");
class VidSrc extends Extractor_1.Extractor {
    id = 'vidsrc';
    label = 'VidSrc';
    ttl = 10800000; // 3h
    domains;
    constructor(fetcher, domains) {
        super(fetcher);
        this.domains = domains;
    }
    supports(_ctx, url) {
        return null !== url.host.match(/vidsrc|vsrc/);
    }
    async extractInternal(ctx, url, meta) {
        // While this is a crappy thing to do, they seem to be blocking overly strict IMO
        const randomIp = `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
        const newCtx = { ...ctx, ip: randomIp };
        return this.extractUsingRandomDomain(newCtx, url, meta, [...this.domains]);
    }
    ;
    async extractUsingRandomDomain(ctx, url, meta, domains) {
        const domainIndex = Math.floor(Math.random() * domains.length);
        const [domain] = domains.splice(domainIndex, 1);
        const newUrl = new URL(url);
        newUrl.hostname = domain;
        let html;
        try {
            html = await this.fetcher.text(ctx, newUrl, { queueLimit: 1 });
        }
        catch (error) {
            /* istanbul ignore next */
            if (domains.length && (error instanceof error_1.TooManyRequestsError || error instanceof error_1.BlockedError)) {
                return this.extractUsingRandomDomain(ctx, url, meta, domains);
            }
            /* istanbul ignore next */
            throw error;
        }
        const $ = cheerio.load(html.replace('<!--', '').replace('-->', '')); // server HTML is commented-out
        const iframeUrl = new URL($('#player_iframe').attr('src').replace(/^\/\//, 'https://'));
        const title = $('title').text().trim();
        return Promise.all($('.server')
            .map((_i, el) => ({ serverName: $(el).text(), dataHash: $(el).data('hash') }))
            .toArray()
            .filter(({ serverName }) => serverName === 'CloudStream Pro')
            .map(async ({ serverName, dataHash }) => {
            const rcpUrl = new URL(`/rcp/${dataHash}`, iframeUrl.origin);
            const iframeHtml = await this.fetcher.text(ctx, rcpUrl, { headers: { Referer: newUrl.origin } });
            const srcMatch = iframeHtml.match(`src:\\s?'(.*)'`);
            const playerHtml = await this.fetcher.text(ctx, new URL(srcMatch[1], iframeUrl.origin), { headers: { Referer: rcpUrl.href } });
            const fileMatch = playerHtml.match(`(https:\\/\\/.*?{v\\d}.*?) or`);
            const m3u8Url = new URL(fileMatch[1].replace(/{v\d}/, iframeUrl.host));
            return {
                url: m3u8Url,
                format: types_1.Format.hls,
                label: serverName,
                meta: {
                    ...meta,
                    height: await (0, utils_1.guessHeightFromPlaylist)(ctx, this.fetcher, m3u8Url, { headers: { Referer: iframeUrl.href } }),
                    title,
                },
            };
        }));
    }
}
exports.VidSrc = VidSrc;
