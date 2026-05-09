import bytes from 'bytes';
import * as cheerio from 'cheerio';
import winston from 'winston';
import { Context, Format, InternalUrlResult, Meta } from '../types';
import { Fetcher, findCountryCodes, findHeight } from '../utils';
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
  meta: Partial<Meta>;
  ts: number;
}

interface HubCdnResult {
  url: URL;
  delegateToHubCloud: boolean;
}

/** True CDN (GDrive) vs HubCloud host that would duplicate. */
const isCdnDirectUrl = (url: URL): boolean => /googleusercontent\.com/.test(url.host);

// Unified extractor for hubdrive/hubcloud/hubcdn — dedup via normalizeAsync() at registry level
export class HubExtractor extends Extractor {
  public readonly id = 'hub';

  public readonly label = 'HubCloud';

  public override readonly cacheVersion = 2;

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

  // Resolve to canonical form for cache key; hubcdn→hubcloud strip, hubcloud strip ?token=, hubdrive resolve→strip
  public override async normalizeAsync(ctx: Context, url: URL): Promise<URL> {
    // HubCDN: resolve→hubcloud canonical or as-is for direct video hosts
    if (/hubcdn/.test(url.host)) {
      try {
        const headers = { Referer: url.href };
        const html = await this.fetcher.text(ctx, url, { headers });
        const result = this.extractHubCdnUrl(html);
        if (result?.delegateToHubCloud) {
          return this.stripQueryParams(result.url);
        }
      } catch {
        // fall through
      }
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
      const resolved = await this.resolveHubDriveToHubCloud(ctx, url);
      if (resolved) {
        this.resolutionCache.set(url.href, { url: resolved.url, meta: resolved.meta, ts: Date.now() });
        return this.stripQueryParams(resolved.url);
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

    // HubCDN → may redirect to HubCloud (needs further extraction) or direct video URL
    if (/hubcdn/.test(url.host)) {
      const headers = { Referer: meta.referer ?? url.href };
      const html = await this.fetcher.text(ctx, url, { headers });
      const result = this.extractHubCdnUrl(html);
      if (!result) return [];
      if (result.delegateToHubCloud) {
        try {
          return await this.hubCloud.extractInternal(ctx, result.url, meta);
        } catch { return []; }
      }
      // True CDN direct URL (googleusercontent.com)
      return [{
        url: result.url,
        format: Format.unknown,
        meta,
        label: 'HubCloud (CDN)',
      }];
    }

    // HubDrive → try resolution cache first, then fallback
    if (/hubdrive/.test(url.host)) {
      const cached = this.resolutionCache.get(url.href);
      if (cached && Date.now() - cached.ts < RESOLUTION_CACHE_TTL) {
        try {
          const enrichedMeta: Meta = { ...cached.meta, ...meta, countryCodes: [...new Set([...cached.meta.countryCodes ?? [], ...meta.countryCodes ?? []])] };
          return await this.hubCloud.extractInternal(ctx, cached.url, enrichedMeta);
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

  // Resolve HubDrive page to HubCloud URL + page metadata
  private async resolveHubDriveToHubCloud(ctx: Context, url: URL): Promise<{ url: URL; meta: Partial<Meta> } | null> {
    let html: string;
    try {
      html = await this.fetcher.text(ctx, url, { headers: { Referer: url.href } });
    } catch {
      return null;
    }

    const $ = cheerio.load(html);
    const hubCloudUrl = this.findHubCloudUrl($);
    if (!hubCloudUrl) return null;

    return { url: hubCloudUrl, meta: this.extractHubDriveMeta($) };
  }

  // Extract metadata from HubDrive page (title, countryCodes, height, bytes)
  private extractHubDriveMeta($: cheerio.CheerioAPI): Partial<Meta> {
    const pageTitle = $('title').text().replace(/^HubDrive\s*\|\s*/, '').trim();
    const fileSizeText = $('td').filter((_i, el) => $(el).text().trim() === 'File Size').next().text().trim();
    const countryCodes = findCountryCodes(pageTitle);
    const height = findHeight(pageTitle);

    return {
      ...(pageTitle && { title: pageTitle }),
      ...(countryCodes.length > 0 && { countryCodes }),
      ...(height !== undefined && { height }),
      ...(fileSizeText && { bytes: bytes.parse(fileSizeText) as number | undefined }),
    };
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

    const hubDriveMeta = this.extractHubDriveMeta($);
    const enrichedMeta: Meta = { ...hubDriveMeta, ...meta, countryCodes: [...new Set([...hubDriveMeta.countryCodes ?? [], ...meta.countryCodes ?? []])] };

    try {
      return await this.hubCloud.extractInternal(ctx, hubCloudUrl, enrichedMeta);
    } catch {
      return [];
    }
  }

  // Unified HubCDN extraction — handles /dl/?link=, ?r=BASE64, <a id="vd">, googleusercontent
  private extractHubCdnUrl(html: string): HubCdnResult | null {
    // Pattern 1: var reurl = "..."
    const reurlMatch = html.match(/var\s+reurl\s*=\s*["']([^"']+)["']/);
    if (reurlMatch?.[1]) {
      const reurlValue = reurlMatch[1];

      // 1a: /dl/?link=URL → extract link param
      if (reurlValue.includes('hubcdn') && reurlValue.includes('/dl/?link=')) {
        try {
          const linkParam = new URL(reurlValue).searchParams.get('link');
          if (linkParam) {
            const targetUrl = new URL(linkParam);
            return { url: targetUrl, delegateToHubCloud: !isCdnDirectUrl(targetUrl) };
          }
        } catch { /* fallthrough */ }
      }

      // 1b: ?r=BASE64 → decode (alternative mirror format)
      const rMatch = reurlValue.match(/[?&]r=([A-Za-z0-9+/=]+)/);
      if (rMatch?.[1]) {
        try {
          const decoded = atob(rMatch[1]);
          const linkMatch = decoded.match(/[?&]link=(.+)$/);
          const finalUrl = linkMatch?.[1] ? new URL(decodeURIComponent(linkMatch[1])) : new URL(decoded);
          return { url: finalUrl, delegateToHubCloud: !isCdnDirectUrl(finalUrl) };
        } catch { /* fallthrough */ }
      }

      // 1c: Plain URL (direct video URL — skip self-referential hubcdn/dl/ URLs)
      if (!reurlValue.includes('/dl/?link=')) {
        try {
          const directUrl = new URL(reurlValue);
          return { url: directUrl, delegateToHubCloud: !isCdnDirectUrl(directUrl) };
        } catch { /* fallthrough */ }
      }
    }

    // Pattern 2: <a id="vd" href='URL'>
    const vdMatch = html.match(/<a\s+id=["']vd["']\s+href=["']([^"']+)["']/i);
    if (vdMatch?.[1]) {
      try {
        const vdUrl = new URL(vdMatch[1]);
        return { url: vdUrl, delegateToHubCloud: !isCdnDirectUrl(vdUrl) };
      } catch { /* next */ }
    }

    // Pattern 3: any googleusercontent.com URL (fallback) — always CDN direct
    const gdriveMatch = html.match(/(https?:\/\/[^\s"'<>]*googleusercontent\.com[^\s"'<>]*)/);
    if (gdriveMatch?.[1]) {
      try {
        return { url: new URL(gdriveMatch[1]), delegateToHubCloud: false };
      } catch { /* next */ }
    }

    return null;
  }

  // Strip query params for canonical cache key
  private stripQueryParams(url: URL): URL {
    const canonical = new URL(url);
    canonical.search = '';
    return canonical;
  }
}
