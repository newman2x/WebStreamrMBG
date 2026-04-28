import bytes from 'bytes';
import * as cheerio from 'cheerio';
import { Context, Format, InternalUrlResult, Meta } from '../types';
import { findCountryCodes, findHeight } from '../utils';
import { Extractor } from './Extractor';

const HUBCLOUD_CACHE_TTL = 120000; // 2 minutes

/** Delay before retrying Hop 1 after a failed Hop 2 (ms). */
const RETRY_DELAY_MS = 2500;

export class HubCloud extends Extractor {
  public readonly id = 'hubcloud';

  public readonly label = 'HubCloud';

  public override readonly cacheVersion = 8;

  public override readonly ttl = HUBCLOUD_CACHE_TTL;

  public supports(_ctx: Context, url: URL): boolean {
    return null !== url.host.match(/hubcloud/);
  }

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    const headers = { Referer: meta.referer ?? url.href };

    const redirectHtml = await this.fetcher.text(ctx, url, { headers });
    const redirectUrl = this.extractRedirectUrl(redirectHtml);
    if (!redirectUrl) {
      return [];
    }

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
      const retryRedirectUrl = this.extractRedirectUrl(retryHtml);
      if (retryRedirectUrl) {
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
    // Pattern 1: var url = 'https://...'
    const varUrlMatch = html.match(/var url ?= ?'(.*?)'/);
    if (varUrlMatch) {
      return varUrlMatch[1] as string;
    }

    // Pattern 2: window.location = 'https://...' or window.location.href = 'https://...'
    const locationMatch = html.match(/window\.location(?:\.href)? ?= ?['"](.*?)['"]/);
    if (locationMatch) {
      return locationMatch[1] as string;
    }

    // Pattern 3: location.replace('https://...')
    const replaceMatch = html.match(/location\.replace\(['"](.*?)['"]\)/);
    if (replaceMatch) {
      return replaceMatch[1] as string;
    }

    // Pattern 4: <meta http-equiv="refresh" content="0;url=https://...">
    const metaRefreshMatch = html.match(/<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?\d+;\s*url=(.*?)["']/i);
    if (metaRefreshMatch) {
      return metaRefreshMatch[1] as string;
    }

    // Pattern 5: document.location = 'https://...'
    const docLocationMatch = html.match(/document\.location(?:\.href)? ?= ?['"](.*?)['"]/);
    if (docLocationMatch) {
      return docLocationMatch[1] as string;
    }

    return null;
  }

  private extractCookieName(html: string): string | null {
    const cookieMatch = html.match(/stck\(\s*['"](\w+)['"]\s*,/);
    return cookieMatch ? (cookieMatch[1] as string) : null;
  }

  private hasValidDownloadContent($: cheerio.CheerioAPI): boolean {
    return $('#size').length > 0 || $('a:contains("FSL")').length > 0 || $('a:contains("PixelServer")').length > 0;
  }
}
