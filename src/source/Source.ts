import { Cacheable, CacheableMemory, Keyv } from 'cacheable';
import { ContentType } from 'stremio-addon-sdk';
import { BlockedError, HttpError, NotFoundError, TooManyRequestsError, TooManyTimeoutsError } from '../error';
import { Context, CountryCode, Meta } from '../types';
import { createKeyvSqlite, Fetcher, Id } from '../utils';

export interface SourceResult {
  url: URL;
  meta: Meta;
}

const sourceResultCache = new Cacheable({
  nonBlocking: true,
  primary: new Keyv({ store: new CacheableMemory({ lruSize: 1024 }) }),
  secondary: createKeyvSqlite('source-cache-v2'),
  stats: true,
});

const DOMAINS_JSON_URL = 'https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json';
const DOMAINS_JSON_TTL = 15 * 60 * 1000; // 15 minutes

export abstract class Source {
  public abstract readonly id: string;

  public abstract readonly label: string;

  public readonly ttl: number = 43200000; // 12h

  public readonly useOnlyWithMaxUrlsFound: number | undefined = undefined; // fallback sources are only considered if we don't have enough URLs from others already

  public abstract readonly contentTypes: ContentType[];

  public abstract readonly countryCodes: CountryCode[];

  public abstract readonly baseUrl: string;

  public readonly priority: number = 0;

  protected abstract handleInternal(ctx: Context, type: ContentType, id: Id): Promise<(SourceResult[])>;

  private static baseUrlCache = new Map<string, { url: string; ts: number }>();
  private static readonly BASE_URL_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

  private static deadDomains = new Map<string, number>();
  private static readonly DEAD_DOMAIN_TTL = 24 * 60 * 60 * 1000; // 24 hours

  private static domainsJsonCache: Record<string, string> | null = null;
  private static domainsJsonTs = 0;

  public static stats() {
    return {
      sourceResultCache: sourceResultCache.stats,
      baseUrlCache: Object.fromEntries(Source.baseUrlCache),
      deadDomains: Object.fromEntries(Source.deadDomains),
      domainsJsonAge: Source.domainsJsonTs ? Date.now() - Source.domainsJsonTs : null,
    };
  };

  public async handle(ctx: Context, type: ContentType, id: Id): Promise<(SourceResult[])> {
    const cacheKey = `${this.id}_${id.toString()}`;

    let sourceResults = (await sourceResultCache.get<SourceResult[]>(cacheKey))
      ?.map(sourceResult => ({ ...sourceResult, url: new URL(sourceResult.url) }));

    if (!sourceResults) {
      try {
        sourceResults = await this.handleInternal(ctx, type, id);
      } catch (error) {
        if (error instanceof NotFoundError) {
          sourceResults = [];
        } else {
          throw error;
        }
      }

      await sourceResultCache.set<SourceResult[]>(cacheKey, sourceResults, this.ttl);
    }

    if (this.countryCodes.includes(CountryCode.multi)) {
      return sourceResults;
    }

    return sourceResults.filter(sourceResult => sourceResult.meta.countryCodes?.some(countryCode => countryCode in ctx.config));
  }

  protected async probeBaseUrl(
    ctx: Context,
    fetcher: Fetcher,
    domainKey: string,
    fallbackCandidates: string[],
  ): Promise<URL> {
    const envOverride = process.env[`${domainKey.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_BASE_URL`];
    if (envOverride) {
      return new URL(envOverride);
    }

    const cached = Source.baseUrlCache.get(domainKey);
    if (cached && Date.now() - cached.ts < Source.BASE_URL_CACHE_TTL) {
      return new URL(cached.url);
    }

    const domainFromJson = await this.fetchDomainFromJson(domainKey, fetcher, ctx);
    if (domainFromJson) {
      Source.baseUrlCache.set(domainKey, { url: domainFromJson, ts: Date.now() });
      return new URL(domainFromJson);
    }

    return this.raceCandidates(ctx, fetcher, fallbackCandidates, domainKey);
  }

  private async fetchDomainFromJson(
    domainKey: string,
    fetcher: Fetcher,
    ctx: Context,
  ): Promise<string | null> {
    if (Source.domainsJsonCache && Date.now() - Source.domainsJsonTs < DOMAINS_JSON_TTL) {
      return Source.domainsJsonCache[domainKey] ?? null;
    }

    try {
      const json = await fetcher.json(ctx, new URL(DOMAINS_JSON_URL)) as Record<string, string>;
      Source.domainsJsonCache = json;
      Source.domainsJsonTs = Date.now();
      return json[domainKey] ?? null;
    } catch {
      if (Source.domainsJsonCache) {
        return Source.domainsJsonCache[domainKey] ?? null;
      }
      return null;
    }
  }

  private async raceCandidates(
    ctx: Context,
    fetcher: Fetcher,
    candidates: string[],
    domainKey: string,
  ): Promise<URL> {
    const now = Date.now();

    const aliveCandidates = candidates.filter((c) => {
      /* istanbul ignore next -- candidates are valid URLs, URL constructor cannot throw */
      try {
        const hostname = new URL(c).hostname;
        const diedAt = Source.deadDomains.get(hostname);
        if (diedAt && now - diedAt < Source.DEAD_DOMAIN_TTL) return false;
        if (diedAt) Source.deadDomains.delete(hostname); // expired — re-try
        return true;
      } catch {
        return false;
      }
    });

    const tryList = aliveCandidates.length > 0 ? aliveCandidates : candidates;

    try {
      const winner = await Promise.any(
        tryList.map(async (candidate) => {
          if (await this.isDomainAlive(ctx, fetcher, candidate)) return candidate;
          throw new Error('domain unreachable');
        }),
      );

      const url = new URL(winner);
      Source.baseUrlCache.set(domainKey, { url: url.href, ts: Date.now() });
      return url;
    } catch {
      for (const c of tryList) {
        /* istanbul ignore next -- candidates are valid URLs, URL constructor cannot throw */
        try {
          Source.deadDomains.set(new URL(c).hostname, Date.now());
        // eslint-disable-next-line no-empty
        } catch {
        }
      }
      throw new NotFoundError();
    }
  }

  private async isDomainAlive(
    ctx: Context,
    fetcher: Fetcher,
    candidate: string,
  ): Promise<boolean> {
    try {
      await fetcher.head(ctx, new URL(candidate), { timeout: 4000 });
      return true; // Got headers — domain is definitely alive
    } catch (error) {
      if (error instanceof BlockedError) return true;
      if (error instanceof NotFoundError) return true;
      if (error instanceof HttpError) return true;
      if (error instanceof TooManyRequestsError) return true;
      if (error instanceof TooManyTimeoutsError) return true;
      return false;
    }
  }
}
