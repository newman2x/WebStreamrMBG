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
exports.Streamtape = void 0;
const bytes_1 = __importDefault(require("bytes"));
const cheerio = __importStar(require("cheerio"));
const types_1 = require("../types");
const utils_1 = require("../utils");
const Extractor_1 = require("./Extractor");
class Streamtape extends Extractor_1.Extractor {
    id = 'streamtape';
    label = 'Streamtape';
    viaMediaFlowProxy = true;
    supports(ctx, url) {
        const supportedDomain = null !== url.host.match(/streamtape/)
            || [
                'strtape.cloud',
                'streamta.pe',
                'strcloud.link',
                'strcloud.club',
                'strtpe.link',
                'scloud.online',
                'stape.fun',
                'streamadblockplus.com',
                'shavetape.cash',
                'streamta.site',
                'streamadblocker.xyz',
                'tapewithadblock.org',
                'adblocktape.wiki',
                'antiadtape.com',
                'tapeblocker.com',
                'streamnoads.com',
                'tapeadvertisement.com',
                'tapeadsenjoyer.com',
                'watchadsontape.com',
            ].includes(url.host);
        return supportedDomain && (0, utils_1.supportsMediaFlowProxy)(ctx);
    }
    normalize(url) {
        return new URL(url.href.replace('/e/', '/v/'));
    }
    async extractInternal(ctx, url, meta) {
        const headers = { Referer: meta.referer ?? url.href };
        // Only needed to properly find non-existing files via 404 response
        await this.fetcher.text(ctx, new URL(url.href.replace('/v/', '/e/')), { headers });
        const html = await this.fetcher.text(ctx, url, { headers });
        const sizeMatch = html.match(/([\d.]+ ?[GM]B)/);
        const $ = cheerio.load(html);
        const title = $('meta[name="og:title"]').attr('content');
        return [
            {
                url: (0, utils_1.buildMediaFlowProxyExtractorRedirectUrl)(ctx, 'Streamtape', url, headers),
                format: types_1.Format.mp4,
                meta: {
                    ...meta,
                    title,
                    bytes: bytes_1.default.parse(sizeMatch[1]),
                },
            },
        ];
    }
    ;
}
exports.Streamtape = Streamtape;
