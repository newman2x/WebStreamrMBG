import * as cheerio from 'cheerio';
import winston from 'winston';
import { Context, Format, InternalUrlResult, Meta } from '../types';
import { Fetcher } from '../utils';
import { Extractor } from './Extractor';
import { HubCloud } from './HubCloud';

const HUBCLOUD_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const RESOLUTION_CACHE_TTL = HUBCLOUD_CACHE_TTL;

const DEAD_HUBCLOUD_HOSTS = new Set([
  'hubcloud.ink',
  'hubcloud.co',
  'hubcloud.cc',
  'hubcloud.me',
  'hubcloud.xyz',
]);

interface ResolutionCacheEntry {
  url: URL;
  ts: number;
}

// Unified extractor for hubdrive/hubcloud/hubcdn — dedup via normalizeAsync() at registry level
export class HubExtractor extends Extractor {
  public readonly id = 'hub';

  public readonly label = 'HubCloud';

  public override readonly cacheVersion = 13;

  public override readonly ttl = HUBCLOUD_CACHE_TTL;

  private readonly hubCloud: HubCloud;

  private readonly resolutionCache = new Map<string, ResolutionCacheEntry>();

  public constructor(fetcher: Fetcher, logger: winston.Logger, hubCloud?: HubCloud) {
    super(fetcher, logger);

    this.hubCloud = hubCloud ?? new HubCloud(fetcher, logger);
  }

  public supports(_ctx: Context, url: URL): boolean {
    return null !== url.host.match(/hubdrive|hubcloud|hubcdn/);
  }

  // Resolve to canonical form for cache key; hubcdn as-is, hubcloud strip ?token=, hubdrive resolve→strip
  public override async normalizeAsync(_ctx: Context, url: URL): Promise<URL> {
    // HubCDN: ?id= is a file identifier, must not strip
    if (/hubcdn/.test(url.host)) {
      return url;
    }

    // HubCloud: strip ephemeral ?token= for canonical cache key only
    if (/hubcloud/.test(url.host)) {
      return this.stripQueryParams(url);
    }

    // HubDrive: resolve→hubcloud then strip query params
    const cached = this.resolutionCache.get(url.href);
    if (cached && Date.now() - cached.ts < RESOLUTION_CACHE_TTL) {
      return this.stripQueryParams(cached.url);
    }

    try {
      const resolved = await this.resolveHubDriveToHubCloud(_ctx, url);
      if (resolved) {
        this.resolutionCache.set(url.href, { url: resolved, ts: Date.now() });
        return this.stripQueryParams(resolved);
      }
    } catch {
      // fall through
    }

    // Resolution failed: return original as fallback
    return url;
  }

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    if (DEAD_HUBCLOUD_HOSTS.has(url.host.toLowerCase())) {
      return [];
    }

    // HubCDN → direct Google video URL extraction
    if (/hubcdn/.test(url.host)) {
      const headers = { Referer: meta.referer ?? url.href };
      const html = await this.fetcher.text(ctx, url, { headers });
      return this.extractHubCdnResult(html, meta);
    }

    // HubDrive → try resolution cache first, then fallback
    if (/hubdrive/.test(url.host)) {
      const cached = this.resolutionCache.get(url.href);
      if (cached && Date.now() - cached.ts < RESOLUTION_CACHE_TTL) {
        try {
          return await this.hubCloud.extractInternal(ctx, cached.url, meta);
        } catch {
          return [];
        }
      }

      // Fallback: re-resolve from scratch
      return this.extractViaHubCloud(ctx, url, meta);
    }

    // HubCloud → delegate directly
    return await this.hubCloud.extractInternal(ctx, url, meta);
  }

  // Resolve HubDrive page to HubCloud URL
  private async resolveHubDriveToHubCloud(ctx: Context, url: URL): Promise<URL | null> {
    let html: string;
    try {
      html = await this.fetcher.text(ctx, url, { headers: { Referer: url.href } });
    } catch {
      return null;
    }

    const $ = cheerio.load(html);
    return this.findHubCloudUrl($);
  }

  // Find HubCloud link on HubDrive page
  private findHubCloudUrl($: cheerio.CheerioAPI): URL | null {
    const hubCloudUrl = $('a:contains("HubCloud")')
      .map((_i, el) => {
        const href = $(el).attr('href');
        if (!href) return null;
        try {
          const parsed = new URL(href);
          if (DEAD_HUBCLOUD_HOSTS.has(parsed.host.toLowerCase())) return null;
          return parsed;
        } catch {
          return null;
        }
      })
      .get(0);

    return hubCloudUrl ?? null;
  }

  // Fallback extraction when normalizeAsync resolution failed
  private async extractViaHubCloud(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    const headers = { Referer: meta.referer ?? url.href };

    let html: string;
    try {
      html = await this.fetcher.text(ctx, url, { headers });
    } catch {
      return [];
    }

    const $ = cheerio.load(html);
    const hubCloudUrl = this.findHubCloudUrl($);

    if (!hubCloudUrl) {
      return [];
    }

    try {
      return await this.hubCloud.extractInternal(ctx, hubCloudUrl, meta);
    } catch {
      return [];
    }
  }

  // Extract direct Google video URL from HubCDN page HTML
  private extractHubCdnResult(html: string, meta: Meta): InternalUrlResult[] {
    // Pattern 1: <a id="vd" href='URL'> (new hubcdn.fans format)
    const vdMatch = html.match(/<a\s+id=["']vd["']\s+href=["']([^"']+)["']/i);
    if (vdMatch?.[1]) {
      try {
        const directUrl = new URL(vdMatch[1]);
        return [{ url: directUrl, format: Format.unknown, meta }];
      // eslint-disable-next-line no-empty
      } catch {
      }
    }

    // Pattern 2: var reurl = "URL" (legacy hubcdn.fans format)
    const reurlMatch = html.match(/var\s+reurl\s*=\s*["']([^"']+)["']/);
    if (reurlMatch?.[1]) {
      try {
        const reurlValue = reurlMatch[1];
        if (reurlValue.includes('hubcdn') && reurlValue.includes('/dl/?link=')) {
          const dlUrl = new URL(reurlValue);
          const linkParam = dlUrl.searchParams.get('link');
          if (linkParam) {
            return [{ url: new URL(linkParam), format: Format.unknown, meta }];
          }
        }
        const directUrl = new URL(reurlValue);
        return [{ url: directUrl, format: Format.unknown, meta }];
      // eslint-disable-next-line no-empty
      } catch {
      }
    }

    // Pattern 3: any googleusercontent.com URL (fallback)
    const gdriveMatch = html.match(/(https?:\/\/[^\s"'<>]*googleusercontent\.com[^\s"'<>]*)/);
    if (gdriveMatch?.[1]) {
      try {
        return [{ url: new URL(gdriveMatch[1]), format: Format.unknown, meta }];
      // eslint-disable-next-line no-empty
      } catch {
      }
    }

    return [];
  }

  // Strip query params for canonical cache key
  private stripQueryParams(url: URL): URL {
    const canonical = new URL(url);
    canonical.search = '';
    return canonical;
  }
}
