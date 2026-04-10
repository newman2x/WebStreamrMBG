"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RgShows = void 0;
const error_1 = require("../error");
const types_1 = require("../types");
const utils_1 = require("../utils");
const Extractor_1 = require("./Extractor");
class RgShows extends Extractor_1.Extractor {
    id = 'rgshows';
    label = 'RgShows';
    ttl = 10800000; // 3h
    supports(_ctx, url) {
        return null !== url.host.match(/rgshows/);
    }
    async extractInternal(ctx, url, meta) {
        const headers = { 'Referer': 'https://www.rgshows.ru/', 'Origin': 'https://www.rgshows.ru', 'User-Agent': 'Mozilla' };
        const data = await this.fetcher.json(ctx, url, { headers });
        const streamUrl = new URL(data.stream.url);
        /* istanbul ignore if */
        if (streamUrl.host.includes('vidzee')) {
            throw new error_1.BlockedError(url, types_1.BlockedReason.unknown, {});
        }
        const isMp4 = streamUrl.href.includes('mp4');
        const isHls = streamUrl.href.includes('m3u8') || streamUrl.href.includes('txt');
        return [
            {
                url: streamUrl,
                format: isMp4 ? types_1.Format.mp4 : (isHls ? types_1.Format.hls : /* istanbul ignore next */ types_1.Format.unknown),
                meta: {
                    ...meta,
                    ...(isHls && { height: meta.height ?? await (0, utils_1.guessHeightFromPlaylist)(ctx, this.fetcher, streamUrl, { headers }) }),
                },
                requestHeaders: headers,
            },
        ];
    }
    ;
}
exports.RgShows = RgShows;
