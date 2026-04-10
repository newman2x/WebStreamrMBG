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
exports.Vidora = void 0;
const cheerio = __importStar(require("cheerio"));
const types_1 = require("../types");
const utils_1 = require("../utils");
const Extractor_1 = require("./Extractor");
class Vidora extends Extractor_1.Extractor {
    id = 'vidora';
    label = 'Vidora';
    ttl = 43200000; // 12h
    supports(_ctx, url) {
        return null !== url.host.match(/vidora/);
    }
    normalize(url) {
        return new URL(url.href.replace('/embed/', '/'));
    }
    async extractInternal(ctx, url, meta) {
        const html = await this.fetcher.text(ctx, url);
        const $ = cheerio.load(html);
        const title = $('title').text().trim().replace(/^Watch /, '').trim();
        const m3u8Url = (0, utils_1.extractUrlFromPacked)(html, [/file: ?"(.*?)"/]);
        const headers = { Origin: url.origin };
        return [
            {
                url: m3u8Url,
                format: types_1.Format.hls,
                meta: {
                    ...meta,
                    height: meta.height ?? await (0, utils_1.guessHeightFromPlaylist)(ctx, this.fetcher, m3u8Url, { headers }),
                    title,
                },
                requestHeaders: headers,
            },
        ];
    }
    ;
}
exports.Vidora = Vidora;
