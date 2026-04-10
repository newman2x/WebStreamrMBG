"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Source = void 0;
const cacheable_1 = require("cacheable");
const error_1 = require("../error");
const types_1 = require("../types");
const utils_1 = require("../utils");
const sourceResultCache = new cacheable_1.Cacheable({
    nonBlocking: true,
    primary: new cacheable_1.Keyv({ store: new cacheable_1.CacheableMemory({ lruSize: 1024 }) }),
    secondary: (0, utils_1.createKeyvSqlite)('source-cache-v2'),
    stats: true,
});
class Source {
    ttl = 43200000; // 12h
    useOnlyWithMaxUrlsFound = undefined; // fallback sources are only considered if we don't have enough URLs from others already
    priority = 0;
    static stats() {
        return {
            sourceResultCache: sourceResultCache.stats,
        };
    }
    ;
    async handle(ctx, type, id) {
        const cacheKey = `${this.id}_${id.toString()}`;
        let sourceResults = (await sourceResultCache.get(cacheKey))
            ?.map(sourceResult => ({ ...sourceResult, url: new URL(sourceResult.url) }));
        if (!sourceResults) {
            try {
                sourceResults = await this.handleInternal(ctx, type, id);
            }
            catch (error) {
                if (error instanceof error_1.NotFoundError) {
                    sourceResults = [];
                }
                else {
                    throw error;
                }
            }
            await sourceResultCache.set(cacheKey, sourceResults, this.ttl);
        }
        if (this.countryCodes.includes(types_1.CountryCode.multi)) {
            return sourceResults;
        }
        return sourceResults.filter(sourceResult => sourceResult.meta.countryCodes?.some(countryCode => countryCode in ctx.config));
    }
}
exports.Source = Source;
