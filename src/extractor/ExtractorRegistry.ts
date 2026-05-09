import { Cacheable, CacheableMemory, Keyv } from 'cacheable';
import winston from 'winston';
import { Context, Format, Meta, UrlResult } from '../types';
import { createKeyvSqlite, isExtractorDisabled } from '../utils';
import { Extractor } from './Extractor';

export class ExtractorRegistry {
  private readonly logger: winston.Logger;
  private readonly extractors: Extractor[];

  private readonly urlResultCache: Cacheable;
  private readonly lazyUrlResultCache: Cacheable;

  public constructor(logger: winston.Logger, extractors: Extractor[]) {
    this.logger = logger;
    this.extractors = extractors;

    this.urlResultCache = new Cacheable({
      nonBlocking: true,
      primary: new Keyv({ store: new CacheableMemory({ lruSize: 1024 }) }),
      secondary: createKeyvSqlite('extractor-cache'),
      stats: true,
    });

    this.lazyUrlResultCache = new Cacheable({
      nonBlocking: true,
      primary: new Keyv({ store: new CacheableMemory({ lruSize: 1024 }) }),
      secondary: createKeyvSqlite('extractor-lazy-cache'),
      stats: true,
    });
  }

  public stats() {
    return {
      urlResultCache: this.urlResultCache.stats,
      lazyUrlResultCache: this.lazyUrlResultCache.stats,
    };
  };

  public async handle(ctx: Context, url: URL, meta?: Meta, allowLazy?: boolean): Promise<UrlResult[]> {
    const extractor = this.extractors.find(extractor => !isExtractorDisabled(ctx.config, extractor) && extractor.supports(ctx, url));
    if (!extractor) {
      return [];
    }

    const normalizedUrl = extractor.normalize(url);
    const canonicalUrl = await extractor.normalizeAsync(ctx, normalizedUrl);
    const cacheKey = this.determineCacheKey(ctx, extractor, canonicalUrl);

    const storedDataRaw = await this.urlResultCache.getRaw<UrlResult[]>(cacheKey);
    const expires = storedDataRaw?.expires;
    if (storedDataRaw && expires) {
      const remainingCacheTtl = expires - Date.now();

      /* istanbul ignore if */
      if (remainingCacheTtl > 0) {
        // Use the minimum of the per-result TTL and the remaining cache TTL.
        return (storedDataRaw.value as UrlResult[]).map(urlResult => ({
          ...urlResult,
          ttl: Math.min(urlResult.ttl, remainingCacheTtl),
          url: new URL(urlResult.url),
        }));
      }
    }

    const lazyUrlResults = await this.lazyUrlResultCache.get<UrlResult[]>(canonicalUrl.href) ?? [];

    /* istanbul ignore next */
    if (
      lazyUrlResults.length && allowLazy && !extractor.viaMediaFlowProxy
      && lazyUrlResults.every(urlResult => urlResult.format !== Format.hls) // related to Android issues, e.g. https://github.com/Stremio/stremio-bugs/issues/1574 or https://github.com/Stremio/stremio-bugs/issues/1579
    ) {
      // generate lazy extract urls
      return lazyUrlResults.map((urlResult, index) => {
        const extractUrl = new URL('/extract/', ctx.hostUrl);

        extractUrl.searchParams.set('index', `${index}`);
        extractUrl.searchParams.set('url', url.href);

        return { ...urlResult, url: extractUrl };
      });
    }

    this.logger.info(`Extract ${url} using ${extractor.id} extractor`, ctx);

    const mergedMeta: Meta = { ...meta, ...lazyUrlResults[0]?.meta };
    const urlResults = await extractor.extract(ctx, normalizedUrl, { extractorId: extractor.id, ...mergedMeta });

    if (!Object.keys(mergedMeta).length || urlResults.some(urlResult => urlResult.error)) {
      await this.urlResultCache.delete(cacheKey);
      await this.lazyUrlResultCache.delete(canonicalUrl.href);

      return urlResults;
    }

    // The server-side cache TTL must respect the shortest per-result TTL
    const perResultTtl = urlResults.length ? Math.min(...urlResults.map(r => r.ttl)) : 43200000;
    const ttl = urlResults.length ? Math.min(extractor.ttl, perResultTtl) : 43200000;

    await this.urlResultCache.set<UrlResult[]>(cacheKey, urlResults, ttl);

    if (extractor.id !== 'external') {
      await this.lazyUrlResultCache.set<UrlResult[]>(canonicalUrl.href, urlResults, 86400000); // 24 hours
    }

    return urlResults;
  };

  private determineCacheKey(ctx: Context, extractor: Extractor, url: URL): string {
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
