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
exports.FileLions = void 0;
const bytes_1 = __importDefault(require("bytes"));
const cheerio = __importStar(require("cheerio"));
const error_1 = require("../error");
const types_1 = require("../types");
const utils_1 = require("../utils");
const Extractor_1 = require("./Extractor");
/** @see https://github.com/Gujal00/ResolveURL/commits/master/script.module.resolveurl/lib/resolveurl/plugins/filelions.py */
class FileLions extends Extractor_1.Extractor {
    id = 'filelions';
    label = 'FileLions';
    viaMediaFlowProxy = true;
    supports(ctx, url) {
        const supportedDomain = null !== url.host.match(/.*lions?/)
            || [
                '6sfkrspw4u.sbs',
                'ajmidyadfihayh.sbs',
                'alhayabambi.sbs',
                'anime7u.com',
                'azipcdn.com',
                'bingezove.com',
                'callistanise.com',
                'coolciima.online',
                'dhtpre.com',
                'dingtezuni.com',
                'dintezuvio.com',
                'e4xb5c2xnz.sbs',
                'egsyxutd.sbs',
                'fdewsdc.sbs',
                'gsfomqu.sbs',
                'javplaya.com',
                'katomen.online',
                'lumiawatch.top',
                'minochinos.com',
                'mivalyo.com',
                'moflix-stream.click',
                'motvy55.store',
                'movearnpre.com',
                'peytonepre.com',
                'ryderjet.com',
                'smoothpre.com',
                'taylorplayer.com',
                'techradar.ink',
                'videoland.sbs',
                'vidhide.com',
                'vidhide.fun',
                'vidhidefast.com',
                'vidhidehub.com',
                'vidhideplus.com',
                'vidhidepre.com',
                'vidhidepro.com',
                'vidhidevip.com',
            ].includes(url.host);
        return supportedDomain && (0, utils_1.supportsMediaFlowProxy)(ctx);
    }
    normalize(url) {
        return new URL(url.href.replace('/v/', '/f/').replace('/download/', '/f/').replace('/file/', '/f/'));
    }
    async extractInternal(ctx, url, meta) {
        const headers = { Referer: meta.referer ?? url.href };
        const html = await this.fetcher.text(ctx, url, { headers });
        if (html.includes('This video can be watched as embed only')) {
            return await this.extractInternal(ctx, new URL(url.href.replace('/f/', '/v/')), meta);
        }
        if (/File Not Found|deleted by administration/.test(html)) {
            throw new error_1.NotFoundError();
        }
        const unpacked = (0, utils_1.unpackEval)(html);
        const heightMatch = unpacked.match(/(\d{3,})p/);
        const sizeMatch = html.match(/([\d.]+ ?[GM]B)/);
        const $ = cheerio.load(html);
        const title = $('meta[name="description"]').attr('content');
        return [
            {
                url: await (0, utils_1.buildMediaFlowProxyExtractorStreamUrl)(ctx, this.fetcher, 'FileLions', url, headers),
                format: types_1.Format.hls,
                meta: {
                    ...meta,
                    height: parseInt(heightMatch[1]),
                    ...(sizeMatch && { bytes: bytes_1.default.parse(sizeMatch[1]) }),
                    ...(title && { title }),
                },
            },
        ];
    }
    ;
}
exports.FileLions = FileLions;
