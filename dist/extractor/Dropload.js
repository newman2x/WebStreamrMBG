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
exports.Dropload = void 0;
const bytes_1 = __importDefault(require("bytes"));
const cheerio = __importStar(require("cheerio"));
const error_1 = require("../error");
const types_1 = require("../types");
const utils_1 = require("../utils");
const Extractor_1 = require("./Extractor");
class Dropload extends Extractor_1.Extractor {
    id = 'dropload';
    label = 'Dropload';
    ttl = 10800000; // 3h
    supports(_ctx, url) {
        return null !== url.host.match(/dropload|dr0pstream/);
    }
    normalize = (url) => new URL(url.href.replace('/d/', '/').replace('/e/', '/').replace('/embed-', '/'));
    async extractInternal(ctx, url, meta) {
        const headers = { Referer: meta.referer ?? url.href };
        const html = await this.fetcher.text(ctx, url, { headers });
        if (html.includes('File Not Found') || html.includes('Pending in queue')) {
            throw new error_1.NotFoundError();
        }
        const playlistUrl = (0, utils_1.extractUrlFromPacked)(html, [/sources:\[{file:"(.*?)"/]);
        const playlistHeaders = { Referer: 'https://dr0pstream.com/' };
        const heightMatch = html.match(/\d{3,}x(\d{3,}),/);
        const height = heightMatch
            ? parseInt(heightMatch[1])
            : meta.height ?? await (0, utils_1.guessHeightFromPlaylist)(ctx, this.fetcher, playlistUrl, { headers: playlistHeaders });
        const sizeMatch = html.match(/([\d.]+ ?[GM]B)/);
        const size = sizeMatch ? bytes_1.default.parse(sizeMatch[1]) : undefined;
        const $ = cheerio.load(html);
        const title = $('.videoplayer h1').text().trim();
        return [
            {
                url: playlistUrl,
                format: types_1.Format.hls,
                meta: {
                    ...meta,
                    title,
                    ...(size && { bytes: size }),
                    ...(height && { height }),
                },
                requestHeaders: playlistHeaders,
            },
        ];
    }
    ;
}
exports.Dropload = Dropload;
