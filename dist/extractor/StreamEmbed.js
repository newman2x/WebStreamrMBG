"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamEmbed = void 0;
const error_1 = require("../error");
const types_1 = require("../types");
const Extractor_1 = require("./Extractor");
class StreamEmbed extends Extractor_1.Extractor {
    id = 'streamembed';
    label = 'StreamEmbed';
    ttl = 259200000; // 3d
    supports(_ctx, url) {
        return null !== url.host.match(/bullstream|mp4player|watch\.gxplayer/);
    }
    async extractInternal(ctx, url, meta) {
        const headers = { Referer: meta.referer ?? url.href };
        const html = await this.fetcher.text(ctx, url, { headers });
        if (/Video is not ready/.test(html)) {
            throw new error_1.NotFoundError();
        }
        const video = JSON.parse(html.match(/video ?= ?(.*);/)[1]);
        return [
            {
                url: new URL(`/m3u8/${video.uid}/${video.md5}/master.txt?s=1&id=${video.id}&cache=${video.status}`, url.origin),
                format: types_1.Format.hls,
                meta: {
                    ...meta,
                    height: parseInt(JSON.parse(video.quality)[0]),
                    title: decodeURIComponent(video.title),
                },
            },
        ];
    }
    ;
}
exports.StreamEmbed = StreamEmbed;
