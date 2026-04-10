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
exports.HubCloud = void 0;
const bytes_1 = __importDefault(require("bytes"));
const cheerio = __importStar(require("cheerio"));
const types_1 = require("../types");
const utils_1 = require("../utils");
const Extractor_1 = require("./Extractor");
class HubCloud extends Extractor_1.Extractor {
    id = 'hubcloud';
    label = 'HubCloud';
    ttl = 43200000; // 12h
    cacheVersion = 1;
    supports(_ctx, url) {
        return null !== url.host.match(/hubcloud/);
    }
    async extractInternal(ctx, url, meta) {
        const headers = { Referer: meta.referer ?? url.href };
        const redirectHtml = await this.fetcher.text(ctx, url, { headers });
        const redirectUrlMatch = redirectHtml.match(/var url ?= ?'(.*?)'/);
        const linksHtml = await this.fetcher.text(ctx, new URL(redirectUrlMatch[1]), { headers: { Referer: url.href } });
        const $ = cheerio.load(linksHtml);
        const title = $('title').text().trim();
        const countryCodes = [...new Set([...meta.countryCodes ?? [], ...(0, utils_1.findCountryCodes)(title)])];
        const height = meta.height ?? (0, utils_1.findHeight)(title);
        return Promise.all([
            ...$('a')
                .filter((_i, el) => {
                const text = $(el).text();
                return text.includes('FSL') && !text.includes('FSLv2');
            })
                .map((_i, el) => {
                const url = new URL($(el).attr('href'));
                return {
                    url,
                    format: types_1.Format.unknown,
                    label: `${this.label} (FSL)`,
                    meta: {
                        ...meta,
                        bytes: bytes_1.default.parse($('#size').text()),
                        extractorId: `${this.id}_fsl`,
                        countryCodes,
                        height,
                        title,
                    },
                };
            }).toArray(),
            ...$('a')
                .filter((_i, el) => {
                const text = $(el).text();
                return text.includes('FSLv2');
            })
                .map((_i, el) => {
                const url = new URL($(el).attr('href'));
                return {
                    url,
                    format: types_1.Format.unknown,
                    label: `${this.label} (FSLv2)`,
                    meta: {
                        ...meta,
                        bytes: bytes_1.default.parse($('#size').text()),
                        extractorId: `${this.id}_fslv2`,
                        countryCodes,
                        height,
                        title,
                    },
                };
            }).toArray(),
            ...$('a')
                .filter((_i, el) => $(el).text().includes('PixelServer'))
                .map((_i, el) => {
                const userUrl = new URL($(el).attr('href').replace('/api/file/', '/u/'));
                const url = new URL(userUrl.href.replace('/u/', '/api/file/'));
                url.searchParams.set('download', '');
                return {
                    url,
                    format: types_1.Format.unknown,
                    label: `${this.label} (PixelServer)`,
                    meta: {
                        ...meta,
                        bytes: bytes_1.default.parse($('#size').text()),
                        extractorId: `${this.id}_pixelserver`,
                        countryCodes,
                        height,
                        title,
                    },
                    requestHeaders: { Referer: userUrl.href },
                };
            }).toArray(),
        ]);
    }
    ;
}
exports.HubCloud = HubCloud;
