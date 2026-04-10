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
exports.Fsst = void 0;
const cheerio = __importStar(require("cheerio"));
const types_1 = require("../types");
const Extractor_1 = require("./Extractor");
class Fsst extends Extractor_1.Extractor {
    id = 'fsst';
    label = 'Fsst';
    ttl = 10800000; // 3h
    supports(_ctx, url) {
        return null !== url.host.match(/fsst/);
    }
    ;
    async extractInternal(ctx, url, meta) {
        const headers = { Referer: meta.referer ?? url.href };
        const html = await this.fetcher.text(ctx, url, { headers, noProxyHeaders: true });
        const $ = cheerio.load(html);
        const title = $('title').text().trim();
        const filesMatch = html.match(/file:"(.*)"/);
        const lastFile = filesMatch[1].split(',').pop();
        const heightAndUrlMatch = lastFile.match(/\[?([\d]*)p?]?(.*)/);
        const fileHref = heightAndUrlMatch[2];
        return [{
                url: await this.fetcher.getFinalRedirectUrl(ctx, new URL(fileHref), { headers, noProxyHeaders: true }, 1),
                format: types_1.Format.mp4,
                meta: {
                    ...meta,
                    height: parseInt(heightAndUrlMatch[1]),
                    title,
                },
            }];
    }
    ;
}
exports.Fsst = Fsst;
