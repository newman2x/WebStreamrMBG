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
exports.SaveFiles = void 0;
const cheerio = __importStar(require("cheerio"));
const error_1 = require("../error");
const types_1 = require("../types");
const Extractor_1 = require("./Extractor");
class SaveFiles extends Extractor_1.Extractor {
    id = 'savefiles';
    label = 'SaveFiles';
    ttl = 21600000; // 6h
    supports(_ctx, url) {
        return null !== url.host.match(/savefiles|streamhls/);
    }
    normalize(url) {
        return new URL(url.href.replace('/e/', '/').replace('/d/', '/'));
    }
    async extractInternal(ctx, url, meta) {
        const headers = { Referer: meta.referer ?? url.href };
        const html = await this.fetcher.text(ctx, url, { headers });
        if (/file was locked|file was deleted/i.test(html)) {
            throw new error_1.NotFoundError();
        }
        const fileMatch = html.match(/file:"(.*?)"/);
        const sizeMatch = html.match(/\[\d{3,}x(\d{3,})/);
        const $ = cheerio.load(html);
        const title = $('.download-title').text().trim();
        return [
            {
                url: new URL(fileMatch[1]),
                format: types_1.Format.hls,
                meta: {
                    ...meta,
                    title,
                    height: parseInt(sizeMatch[1]),
                },
            },
        ];
    }
    ;
}
exports.SaveFiles = SaveFiles;
