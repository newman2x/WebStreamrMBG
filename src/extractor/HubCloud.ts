import bytes from 'bytes';
import * as cheerio from 'cheerio';
import { Context, Format, InternalUrlResult, Meta } from '../types';
import { findCountryCodes, findHeight } from '../utils';
import { Extractor } from './Extractor';

const HUBCLOUD_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const DEAD_DOMAINS = new Set([
  'hubcloud.ink',
  'hubcloud.co',
  'hubcloud.cc',
  'hubcloud.me',
  'hubcloud.xyz',
]);

/** Delay before retrying Hop 1 after a failed Hop 2 (ms). */
const RETRY_DELAY_MS = 2500;

/**
 * Server categories matched by button text, ordered from highest to lowest quality.
 * Higher priority = more reliable / supports HTTP Range (seekable).
 * Non-seekable categories (10Gbps, PDL, DF) are deduped when a seekable alternative exists.
 */
const SERVER_CATEGORIES = [
  { buttonIncludes: 'FSLv2', label: 'HubCloud (FSLv2)', extractorId: 'hubcloud_fslv2', priority: 4, seekable: true },
  { buttonIncludes: 'FSL', label: 'HubCloud (FSL)', extractorId: 'hubcloud_fsl', priority: 5, seekable: true },
  { buttonIncludes: '10Gbps', label: 'HubCloud (10Gbps)', extractorId: 'hubcloud_fast', priority: 2, seekable: false },
  { buttonIncludes: 'PixelServer', label: 'HubCloud (PxlSrv)', extractorId: 'hubcloud_pixelserver', priority: 3, seekable: true },
  { buttonIncludes: 'PDL', label: 'HubCloud (PDL)', extractorId: 'hubcloud_pdl', priority: 1, seekable: false },
  { buttonIncludes: 'Download File', label: 'HubCloud (DF)', extractorId: 'hubcloud_direct', priority: 0, seekable: false },
] as const;

const REDIRECT_STRATEGIES: readonly ((html: string) => string | null)[] = [
  html => html.match(/var url\s*=\s*['"](.*?)['"]/)?.[1] ?? null,

  html => html.match(/window\.location(?:\.href)?\s*=\s*['"](.*?)['"]/)?.[1] ?? null,

  html => html.match(/location\.replace\(['"](.*?)['"]\)/)?.[1] ?? null,

  html => html.match(/<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?\d+;\s*url=(.*?)["']/i)?.[1] ?? null,

  html => html.match(/document\.location(?:\.href)?\s*=\s*['"](.*?)['"]/)?.[1] ?? null,

  html => html.match(/location\.href\s*=\s*['"](.*?)['"]/)?.[1] ?? null,

  html => html.match(/location\.assign\(['"](.*?)['"]\)/)?.[1] ?? null,

  html => html.match(/window\.open\(['"](.*?)['"]/)?.[1] ?? null,

  html => html.match(/data-(?:url|href|link)\s*=\s*['"](.*?)['"]/)?.[1] ?? null,

  (html) => {
    const m = html.match(/<iframe[^>]+src\s*=\s*['"](.*?)['"]/);
    if (m?.[1] && (m[1].includes('hubcloud') || m[1].includes('gamerxyt'))) return m[1];
    return null;
  },

  (html) => {
    const m = html.match(/var\s+\w+\s*=\s*['"]([^'"]*(?:hubcloud|gamerxyt|hubdrive|hubcdn)[^'"]*)['"]/);
    return m?.[1] ?? null;
  },

  (html) => {
    const m = html.match(/https?:\/\/(?:hubcloud\.[a-z.]+|hubdrive\.[a-z.]+|gamerxyt\.com|hubcdn)[^\s'"<>)]+/);
    return m?.[0] ?? null;
  },
];

export class HubCloud extends Extractor {
  public readonly id = 'hubcloud';

  public readonly label = 'HubCloud';

  public override readonly cacheVersion = 12;

  public override readonly ttl = HUBCLOUD_CACHE_TTL;

  public supports(_ctx: Context, url: URL): boolean {
    return null !== url.host.match(/hubcloud/);
  }

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    if (DEAD_DOMAINS.has(url.host.toLowerCase())) {
      return [];
    }

    const headers = { Referer: meta.referer ?? url.href };

    const redirectHtml = await this.fetcher.text(ctx, url, { headers });
    const rawRedirectUrl = this.extractRedirectUrl(redirectHtml);
    if (!rawRedirectUrl) {
      return [];
    }

    const redirectUrl = rawRedirectUrl.startsWith('http') ? rawRedirectUrl : `${url.origin}${rawRedirectUrl}`;

    const cookieName = this.extractCookieName(redirectHtml);
    if (cookieName) {
      this.fetcher.setCookie(redirectUrl, `${cookieName}=s4t`);
    }

    let linksHtml = await this.fetcher.text(ctx, new URL(redirectUrl), { headers: { Referer: url.href } });
    let $ = cheerio.load(linksHtml);

    // If the download links page doesn't contain expected content (e.g., no #size element
    // and no download links), it may be a token-expired error page. Retry once.
    if (!this.hasValidDownloadContent($)) {
      // Wait a moment, then re-fetch Hop 1 to get a fresh token
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));

      const retryHtml = await this.fetcher.text(ctx, url, { headers });
      const rawRetryRedirectUrl = this.extractRedirectUrl(retryHtml);
      if (rawRetryRedirectUrl) {
        const retryRedirectUrl = rawRetryRedirectUrl.startsWith('http') ? rawRetryRedirectUrl : `${url.origin}${rawRetryRedirectUrl}`;
        if (cookieName) {
          this.fetcher.setCookie(retryRedirectUrl, `${cookieName}=s4t`);
        }
        linksHtml = await this.fetcher.text(ctx, new URL(retryRedirectUrl), { headers: { Referer: url.href } });
        $ = cheerio.load(linksHtml);
      }

      // If still no valid content after retry, return empty (don't cache a failure)
      if (!this.hasValidDownloadContent($)) {
        return [];
      }
    }

    const title = $('title').text().trim();
    const countryCodes = [...new Set([...meta.countryCodes ?? [], ...findCountryCodes(title)])];
    const height = meta.height ?? findHeight(title);
    const fileSize = bytes.parse($('#size').text()) as number;

    // Collect all download links and classify them by button text
    const allLinks = $('a').toArray();
    const classified: InternalUrlResult[] = [];
    const matchedIndices = new Set<number>();

    // Pass 1: Match links by button text in priority order
    for (const category of SERVER_CATEGORIES) {
      for (let i = 0; i < allLinks.length; i++) {
        if (matchedIndices.has(i)) continue;

        const el = allLinks[i];
        /* istanbul ignore if -- cheerio .toArray() never produces null entries */
        if (!el) continue;
        const text = $(el).text();
        const href = $(el).attr('href');

        if (!href || href.toLowerCase().includes('.zip')) continue;

        if (text.includes(category.buttonIncludes)) {
          // FSL must NOT match FSLv2 buttons (FSLv2 is checked first so this is safe)
          // istanbul ignore if -- each link matches at most one category, so FSL never sees FSLv2 text
          if (category.buttonIncludes === 'FSL' && text.includes('FSLv2')) continue;

          matchedIndices.add(i);

          // PixelServer: special handling — convert /u/ → /api/file/?download= and HEAD check
          if (category.buttonIncludes === 'PixelServer') {
            try {
              const userUrl = new URL(href.replace('/api/file/', '/u/'));
              const apiUrl = new URL(userUrl.href.replace('/u/', '/api/file/'));
              apiUrl.searchParams.set('download', '');
              await this.fetcher.head(ctx, apiUrl, { headers: { Referer: userUrl.href } });
              classified.push({
                url: apiUrl,
                format: Format.unknown,
                ttl: HUBCLOUD_CACHE_TTL,
                label: category.label,
                meta: { ...meta, bytes: fileSize, extractorId: category.extractorId, countryCodes, height, title },
                requestHeaders: { Referer: userUrl.href },
              });
            } catch {
              // PixelServer link is dead — skip it
            }
          } else {
            classified.push({
              url: new URL(href),
              format: Format.unknown,
              ttl: HUBCLOUD_CACHE_TTL,
              label: category.label,
              meta: {
                ...meta,
                bytes: fileSize,
                extractorId: category.extractorId,
                countryCodes,
                height,
                title: category.seekable ? title : `${title} ⚠️ no seek`,
              },
            });
          }
        }
      }
    }

    // Priority-based dedup: if same file exists via both seekable and non-seekable,
    // drop the non-seekable duplicate. Keep both FSL and FSLv2 (both seekable).
    const isSeekable = (label: string | undefined): boolean => {
      /* istanbul ignore if -- label is always set by extractInternal */
      if (!label) return false;
      const cat = SERVER_CATEGORIES.find(c => c.label === label);
      /* istanbul ignore next -- labels always come from SERVER_CATEGORIES, so cat is never undefined */
      return cat?.seekable ?? false;
    };

    const seekableResults = classified.filter(r => isSeekable(r.label));

    if (seekableResults.length > 0) {
      // Compare by bytes only — titles differ (non-seekable have "⚠️ no seek" suffix)
      const hasSeekableForFile = (result: InternalUrlResult): boolean =>
        seekableResults.some(s => s.meta?.bytes === result.meta?.bytes);

      return classified.filter((r) => {
        if (isSeekable(r.label)) return true;
        // Drop non-seekable if a seekable alternative exists for the same file
        return !hasSeekableForFile(r);
      });
    }

    return classified;
  }

  private extractRedirectUrl(html: string): string | null {
    for (const strategy of REDIRECT_STRATEGIES) {
      const result = strategy(html);
      if (result) {
        if (strategy === REDIRECT_STRATEGIES[REDIRECT_STRATEGIES.length - 1]) {
          this.logger.warn(`Brute-force URL extraction used — redirect strategy array may need updating. Extracted: ${result}`);
        }
        return result;
      }
    }
    return null;
  }

  private extractCookieName(html: string): string | null {
    const cookieMatch = html.match(/stck\(\s*['"](\w+)['"]\s*,/);
    return cookieMatch ? (cookieMatch[1] as string) : null;
  }

  private hasValidDownloadContent($: cheerio.CheerioAPI): boolean {
    if ($('#size').length > 0 || $('a:contains("FSL")').length > 0 || $('a:contains("PixelServer")').length > 0) {
      return true;
    }

    const extendedSelectors = [
      'a#download',
      'a[href*="hubcloud.php"]',
      'a[href*="gamerxyt.com"]',
      'a[href*="hubcloud.one"]',
      'a[href*="workers.dev"]',
      'a[href*="hubcdn"]',
      '.download-btn',
      'a[href*="download"]',
      'a.btn.btn-primary',
      '.btn-success',
      '.btn-danger',
    ];
    for (const selector of extendedSelectors) {
      if ($(selector).length > 0) {
        return true;
      }
    }

    return false;
  }
}
