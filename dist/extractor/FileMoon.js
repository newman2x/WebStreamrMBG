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
exports.FileMoon = void 0;
const cheerio = __importStar(require("cheerio"));
const error_1 = require("../error");
const types_1 = require("../types");
const utils_1 = require("../utils");
const Extractor_1 = require("./Extractor");
/** @see https://github.com/Gujal00/ResolveURL/blob/master/script.module.resolveurl/lib/resolveurl/plugins/filemoon.py */
class FileMoon extends Extractor_1.Extractor {
    id = 'filemoon';
    label = 'FileMoon';
    viaMediaFlowProxy = true;
    supports(ctx, url) {
        const supportedDomain = null !== url.host.match(/filemoon/)
            || [
                '1azayf9w.xyz',
                '222i8x.lol',
                '81u6xl9d.xyz',
                '8mhlloqo.fun',
                '96ar.com',
                'bf0skv.org',
                'boosteradx.online',
                'c1z39.com',
                'cinegrab.com',
                'f51rm.com',
                'furher.in',
                'kerapoxy.cc',
                'l1afav.net',
                'moonmov.pro',
                'smdfs40r.skin',
                'xcoic.com',
                'z1ekv717.fun',
            ].includes(url.host);
        return supportedDomain && (0, utils_1.supportsMediaFlowProxy)(ctx);
    }
    normalize(url) {
        return new URL(url.href.replace('/e/', '/d/'));
    }
    async extractInternal(ctx, url, meta, originalUrl) {
        const headers = { Referer: meta.referer ?? url.href };
        const html = await this.fetcher.text(ctx, url, { headers });
        if (/Page not found/.test(html)) {
            throw new error_1.NotFoundError();
        }
        const $ = cheerio.load(html);
        const title = $('h3').text().trim();
        const iframeUrlMatches = Array.from(html.matchAll(/iframe.*?src=["'](.*?)["']/g));
        if (iframeUrlMatches.length) {
            // Use last match because there can be fake adblock catcher urls before
            return await this.extractInternal(ctx, new URL(iframeUrlMatches[iframeUrlMatches.length - 1][1]), { title, ...meta }, url);
        }
        const playlistUrl = await (0, utils_1.buildMediaFlowProxyExtractorStreamUrl)(ctx, this.fetcher, 'FileMoon', originalUrl, headers);
        const unpacked = (0, utils_1.unpackEval)(html);
        const heightMatch = unpacked.match(/(\d{3,})p/);
        return [
            {
                url: playlistUrl,
                format: types_1.Format.hls,
                meta: {
                    ...meta,
                    ...(heightMatch && { height: parseInt(heightMatch[1]) }),
                },
            },
        ];
    }
    ;
}
exports.FileMoon = FileMoon;
