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
exports.Uqload = void 0;
const cheerio = __importStar(require("cheerio"));
const error_1 = require("../error");
const types_1 = require("../types");
const utils_1 = require("../utils");
const Extractor_1 = require("./Extractor");
class Uqload extends Extractor_1.Extractor {
    id = 'uqload';
    label = 'Uqload';
    viaMediaFlowProxy = true;
    supports(ctx, url) {
        return null !== url.host.match(/uqload/) && (0, utils_1.supportsMediaFlowProxy)(ctx);
    }
    normalize(url) {
        return new URL(url.href.replace('/embed-', '/'));
    }
    async extractInternal(ctx, url, meta) {
        const html = await this.fetcher.text(ctx, url);
        if (/File Not Found/.test(html)) {
            throw new error_1.NotFoundError();
        }
        const heightMatch = html.match(/\d{3,}x(\d{3,})/);
        const $ = cheerio.load(html);
        const title = $('h1').text().trim();
        return [
            {
                url: (0, utils_1.buildMediaFlowProxyExtractorRedirectUrl)(ctx, 'Uqload', url),
                format: types_1.Format.mp4,
                meta: {
                    ...meta,
                    title,
                    ...(heightMatch && {
                        height: parseInt(heightMatch[1]),
                    }),
                },
            },
        ];
    }
    ;
}
exports.Uqload = Uqload;
