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
exports.DoodStream = void 0;
const bytes_1 = __importDefault(require("bytes"));
const cheerio = __importStar(require("cheerio"));
const error_1 = require("../error");
const types_1 = require("../types");
const utils_1 = require("../utils");
const Extractor_1 = require("./Extractor");
class DoodStream extends Extractor_1.Extractor {
    id = 'doodstream';
    label = 'DoodStream';
    ttl = 21600000; // 6h
    viaMediaFlowProxy = true;
    /** @see https://github.com/Gujal00/ResolveURL/blob/master/script.module.resolveurl/lib/resolveurl/plugins/doodstream.py */
    supports(ctx, url) {
        return null !== url.host.match(/dood|do[0-9]go|doood|dooood|ds2play|ds2video|dsvplay|d0o0d|do0od|d0000d|d000d|myvidplay|vidply|all3do|doply|vide0|vvide0|d-s/) && (0, utils_1.supportsMediaFlowProxy)(ctx);
    }
    ;
    normalize(url) {
        const videoId = url.pathname.replace(/\/+$/, '').split('/').at(-1);
        return new URL(`http://dood.to/e/${videoId}`);
    }
    ;
    async extractInternal(ctx, url, meta) {
        const headers = { Referer: meta.referer ?? url.href };
        const html = await this.fetcher.text(ctx, url, { headers });
        if (/Video not found/.test(html)) {
            throw new error_1.NotFoundError();
        }
        const $ = cheerio.load(html);
        const title = $('title').text().trim().replace(/ - DoodStream$/, '').trim();
        const downloadHtml = await this.fetcher.text(ctx, new URL(url.href.replace('/e/', '/d/')));
        const sizeMatch = downloadHtml.match(/([\d.]+ ?[GM]B)/);
        return [
            {
                url: (0, utils_1.buildMediaFlowProxyExtractorRedirectUrl)(ctx, 'Doodstream', url, headers),
                format: types_1.Format.mp4,
                meta: {
                    ...meta,
                    title,
                    ...(sizeMatch && { bytes: bytes_1.default.parse(sizeMatch[1]) }),
                },
            },
        ];
    }
    ;
}
exports.DoodStream = DoodStream;
