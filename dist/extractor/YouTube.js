"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.YouTube = void 0;
const types_1 = require("../types");
const Extractor_1 = require("./Extractor");
class YouTube extends Extractor_1.Extractor {
    id = 'youtube';
    label = 'YouTube';
    ttl = 21600000; // 6h
    supports(_ctx, url) {
        return null !== url.host.match(/youtube/) && url.searchParams.has('v');
    }
    async extractInternal(ctx, url, meta) {
        const headers = { Referer: meta.referer ?? url.href };
        const html = await this.fetcher.text(ctx, url, { headers });
        const titleMatch = html.match(/"title":{"runs":\[{"text":"(.*?)"/);
        return [
            {
                url,
                format: types_1.Format.unknown,
                ytId: url.searchParams.get('v'),
                meta: {
                    ...meta,
                    title: titleMatch[1],
                },
            },
        ];
    }
    ;
}
exports.YouTube = YouTube;
