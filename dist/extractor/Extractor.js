"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Extractor = void 0;
const error_1 = require("../error");
const types_1 = require("../types");
class Extractor {
    ttl = 900000; // 15m
    cacheVersion = undefined;
    viaMediaFlowProxy = false;
    fetcher;
    constructor(fetcher) {
        this.fetcher = fetcher;
    }
    normalize(url) {
        return url;
    }
    ;
    async extract(ctx, url, meta) {
        try {
            return (await this.extractInternal(ctx, url, meta)).map(urlResult => ({
                ...urlResult,
                label: this.formatLabel(urlResult.label ?? this.label),
                ttl: this.ttl,
            }));
        }
        catch (error) {
            if (error instanceof error_1.NotFoundError) {
                return [];
            }
            return [
                {
                    url,
                    format: types_1.Format.unknown,
                    isExternal: true,
                    error,
                    label: this.formatLabel(this.label),
                    ttl: 0,
                    meta,
                },
            ];
        }
    }
    ;
    formatLabel(label) {
        return this.viaMediaFlowProxy ? `${label} (MFP)` : label;
    }
}
exports.Extractor = Extractor;
