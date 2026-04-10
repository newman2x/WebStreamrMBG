"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Fastream = void 0;
const bytes_1 = __importDefault(require("bytes"));
const error_1 = require("../error");
const types_1 = require("../types");
const utils_1 = require("../utils");
const Extractor_1 = require("./Extractor");
class Fastream extends Extractor_1.Extractor {
    id = 'fastream';
    label = 'Fastream';
    viaMediaFlowProxy = true;
    supports(ctx, url) {
        return null !== url.host.match(/fastream/) && (0, utils_1.supportsMediaFlowProxy)(ctx);
    }
    normalize(url) {
        return new URL(url.href.replace('/e/', '/embed-').replace('/d/', '/embed-'));
    }
    async extractInternal(ctx, url, meta) {
        const headers = { Referer: meta.referer ?? url.href };
        const downloadUrl = new URL(url.href.replace('/embed-', '/d/'));
        const html = await this.fetcher.text(ctx, downloadUrl, { headers });
        if (/No such file/.test(html)) {
            throw new error_1.NotFoundError();
        }
        const playlistUrl = await (0, utils_1.buildMediaFlowProxyExtractorStreamUrl)(ctx, this.fetcher, 'Fastream', url, headers);
        const heightAndSizeMatch = html.match(/\d{3,}x(\d{3,}), ([\d.]+ ?[GM]B)/);
        const titleMatch = html.match(/>Download (.*?)</);
        return [
            {
                url: playlistUrl,
                format: types_1.Format.hls,
                meta: {
                    ...meta,
                    bytes: bytes_1.default.parse(heightAndSizeMatch[2]),
                    height: parseInt(heightAndSizeMatch[1]),
                    title: titleMatch[1],
                },
            },
        ];
    }
    ;
}
exports.Fastream = Fastream;
