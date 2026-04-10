"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExternalUrl = void 0;
const types_1 = require("../types");
const utils_1 = require("../utils");
const Extractor_1 = require("./Extractor");
class ExternalUrl extends Extractor_1.Extractor {
    id = 'external';
    label = 'External';
    ttl = 21600000; // 6h
    supports(ctx, url) {
        return (0, utils_1.showExternalUrls)(ctx.config) && null !== url.host.match(/.*/);
    }
    async extractInternal(_ctx, url, meta) {
        return [
            {
                url: url,
                format: types_1.Format.unknown,
                isExternal: true,
                label: `${url.host}`,
                meta,
            },
        ];
    }
    ;
}
exports.ExternalUrl = ExternalUrl;
