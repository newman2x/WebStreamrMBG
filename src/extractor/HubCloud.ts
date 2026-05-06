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
    const m = html.match(/https?:\/\/(?:hubcloud\.[a-z.]+|hubdrive\.[a-z.]+|gamerxyt\.com|hubcdn\.fans)[^\s'"<>)]+/);
    return m?.[0] ?? null;
  },
];

export class HubCloud extends Extractor {
  public readonly id = 'hubcloud';

  public readonly label = 'HubCloud';

  public override readonly cacheVersion = 9;

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

    return Promise.all([
      ...$('a')
        .filter((_i, el) => {
          const text = $(el).text();
          return text.includes('FSL') && !text.includes('FSLv2');
        })
        .map((_i, el) => {
          const fslHref = $(el).attr('href') as string;
          return {
            url: new URL(fslHref),
            format: Format.unknown,
            ttl: HUBCLOUD_CACHE_TTL,
            label: `${this.label} (FSL)`,
            meta: { ...meta, bytes: fileSize, extractorId: `${this.id}_fsl`, countryCodes, height, title },
          };
        }).toArray(),
      ...$('a')
        .filter((_i, el) => $(el).text().includes('FSLv2'))
        .map((_i, el) => {
          const fslHref = $(el).attr('href') as string;
          return {
            url: new URL(fslHref),
            format: Format.unknown,
            ttl: HUBCLOUD_CACHE_TTL,
            label: `${this.label} (FSLv2)`,
            meta: { ...meta, bytes: fileSize, extractorId: `${this.id}_fslv2`, countryCodes, height, title },
          };
        }).toArray(),
      ...await Promise.all($('a')
        .filter((_i, el) => $(el).text().includes('PixelServer'))
        .map((_i, el) => {
          const userUrl = new URL(($(el).attr('href') as string).replace('/api/file/', '/u/'));
          const url = new URL(userUrl.href.replace('/u/', '/api/file/'));
          url.searchParams.set('download', '');
          return { url, userUrl };
        }).toArray()
        .map(async ({ url, userUrl }) => {
          try {
            await this.fetcher.head(ctx, url, { headers: { Referer: userUrl.href } });
          } catch {
            return null;
          }
          return {
            url,
            format: Format.unknown,
            label: `${this.label} (PixelServer)`,
            meta: { ...meta, bytes: fileSize, extractorId: `${this.id}_pixelserver`, countryCodes, height, title },
            requestHeaders: { Referer: userUrl.href },
          };
        }),
      ).then(results => results.filter(r => r !== null)),
    ]);
  };

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
