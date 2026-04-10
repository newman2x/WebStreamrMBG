"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExtractorRegistry = void 0;
const cacheable_1 = require("cacheable");
const types_1 = require("../types");
const utils_1 = require("../utils");
class ExtractorRegistry {
    logger;
    extractors;
    urlResultCache;
    lazyUrlResultCache;
    constructor(logger, extractors) {
        this.logger = logger;
        this.extractors = extractors;
        this.urlResultCache = new cacheable_1.Cacheable({
            nonBlocking: true,
            primary: new cacheable_1.Keyv({ store: new cacheable_1.CacheableMemory({ lruSize: 1024 }) }),
            secondary: (0, utils_1.createKeyvSqlite)('extractor-cache'),
            stats: true,
        });
        this.lazyUrlResultCache = new cacheable_1.Cacheable({
            nonBlocking: true,
            primary: new cacheable_1.Keyv({ store: new cacheable_1.CacheableMemory({ lruSize: 1024 }) }),
            secondary: (0, utils_1.createKeyvSqlite)('extractor-lazy-cache'),
            stats: true,
        });
    }
    stats() {
        return {
            urlResultCache: this.urlResultCache.stats,
            lazyUrlResultCache: this.lazyUrlResultCache.stats,
        };
    }
    ;
    async handle(ctx, url, meta, allowLazy) {
        const extractor = this.extractors.find(extractor => !(0, utils_1.isExtractorDisabled)(ctx.config, extractor) && extractor.supports(ctx, url));
        if (!extractor) {
            return [];
        }
        const normalizedUrl = extractor.normalize(url);
        const cacheKey = this.determineCacheKey(ctx, extractor, normalizedUrl);
        const storedDataRaw = await this.urlResultCache.getRaw(cacheKey);
        const expires = storedDataRaw?.expires;
        if (storedDataRaw && expires) {
            const ttl = expires - Date.now();
            /* istanbul ignore if */
            if (ttl > 0) {
                return storedDataRaw.value.map(urlResult => ({ ...urlResult, ttl, url: new URL(urlResult.url) }));
            }
        }
        const lazyUrlResults = await this.lazyUrlResultCache.get(normalizedUrl.href) ?? [];
        /* istanbul ignore next */
        if (lazyUrlResults.length && allowLazy && !extractor.viaMediaFlowProxy
            && lazyUrlResults.every(urlResult => urlResult.format !== types_1.Format.hls) // related to Android issues, e.g. https://github.com/Stremio/stremio-bugs/issues/1574 or https://github.com/Stremio/stremio-bugs/issues/1579
        ) {
            // generate lazy extract urls
            return lazyUrlResults.map((urlResult, index) => {
                const extractUrl = new URL(`${(0, utils_1.envGet)('PROTOCOL')}:${(0, utils_1.envGet)('HOST')}/extract/`);
                extractUrl.searchParams.set('index', `${index}`);
                extractUrl.searchParams.set('url', url.href);
                return { ...urlResult, url: extractUrl };
            });
        }
        this.logger.info(`Extract ${url} using ${extractor.id} extractor`, ctx);
        const mergedMeta = { ...meta, ...lazyUrlResults[0]?.meta };
        const urlResults = await extractor.extract(ctx, normalizedUrl, { extractorId: extractor.id, ...mergedMeta });
        if (!Object.keys(mergedMeta).length || urlResults.some(urlResult => urlResult.error)) {
            await this.urlResultCache.delete(cacheKey);
            await this.lazyUrlResultCache.delete(normalizedUrl.href);
            return urlResults;
        }
        const ttl = urlResults.length ? extractor.ttl : 43200000; // 12h
        await this.urlResultCache.set(cacheKey, urlResults, ttl);
        if (extractor.id !== 'external') {
            await this.lazyUrlResultCache.set(normalizedUrl.href, urlResults, 2629800000); // 1 month
        }
        return urlResults;
    }
    ;
    determineCacheKey(ctx, extractor, url) {
        let suffix = '';
        if (extractor.viaMediaFlowProxy) {
            suffix += `_${ctx.config.mediaFlowProxyUrl}`;
        }
        if (extractor.cacheVersion) {
            suffix += `_${extractor.cacheVersion}`;
        }
        return `${extractor.id}_${url}${suffix}`;
    }
}
exports.ExtractorRegistry = ExtractorRegistry;
