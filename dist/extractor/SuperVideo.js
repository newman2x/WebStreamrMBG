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
exports.SuperVideo = void 0;
const bytes_1 = __importDefault(require("bytes"));
const cheerio = __importStar(require("cheerio"));
const error_1 = require("../error");
const types_1 = require("../types");
const utils_1 = require("../utils");
const Extractor_1 = require("./Extractor");
class SuperVideo extends Extractor_1.Extractor {
    id = 'supervideo';
    label = 'SuperVideo';
    ttl = 10800000; // 3h
    supports(_ctx, url) {
        return null !== url.host.match(/supervideo/);
    }
    normalize(url) {
        return new URL(url.href.replace('/e/', '/').replace('/k/', '/').replace('/embed-', '/'));
    }
    async extractInternal(ctx, url, meta) {
        const headers = { Referer: meta.referer ?? url.href };
        const html = await this.fetcher.text(ctx, url, { headers });
        if (html.includes('This video can be watched as embed only')) {
            return await this.extractInternal(ctx, new URL(`/e${url.pathname}`, url.origin), meta);
        }
        if (/'The file was deleted|The file expired|Video is processing/.test(html)) {
            throw new error_1.NotFoundError();
        }
        const playlistUrl = (0, utils_1.extractUrlFromPacked)(html, [/sources:\[{file:"(.*?)"/]);
        const playlistHeaders = { Referer: 'https://supervideo.cc/' };
        const heightAndSizeMatch = html.match(/\d{3,}x(\d{3,}), ([\d.]+ ?[GM]B)/);
        const size = heightAndSizeMatch ? bytes_1.default.parse(heightAndSizeMatch[2]) : undefined;
        const height = heightAndSizeMatch
            ? parseInt(heightAndSizeMatch[1])
            : meta.height ?? await (0, utils_1.guessHeightFromPlaylist)(ctx, this.fetcher, playlistUrl, { headers: playlistHeaders });
        const $ = cheerio.load(html);
        const title = $('.download__title').text().trim();
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
exports.SuperVideo = SuperVideo;
