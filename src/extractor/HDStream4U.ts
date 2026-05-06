import winston from 'winston';
import { Context, Format, InternalUrlResult, Meta } from '../types';
import { Fetcher } from '../utils';
import { Extractor } from './Extractor';

export class HDStream4U extends Extractor {
  public readonly id = 'hdstream4u';
  public readonly label = 'HDStream4U';
  public override readonly ttl = 300000; // 5 min

  public constructor(fetcher: Fetcher, logger: winston.Logger) {
    super(fetcher, logger);
  }

  public supports(_ctx: Context, url: URL): boolean {
    return url.host.includes('hdstream4u.com');
  }

  public override normalize(url: URL): URL {
    // Convert /file/ URLs to /embed/ URLs for extraction
    const code = url.pathname.replace(/\/+$/, '').split('/').at(-1) as string;
    return new URL(`https://hdstream4u.com/embed/${code}`);
  }

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    // URL is already normalized to /embed/ by normalize()
    const headers = { Referer: meta.referer ?? url.href };

    let html: string;
    try {
      html = await this.fetcher.text(ctx, url, { headers });
    } catch (error) {
      /* istanbul ignore next */
      this.logger.warn(`Failed to fetch HDStream4U embed page: ${error}`);
      /* istanbul ignore next */
      return [];
    }

    // Try to extract m3u8 URL from JWPlayer setup in the embed page
    const m3u8Url = this.extractM3u8Url(html);

    if (m3u8Url) {
      return [
        {
          url: m3u8Url,
          format: Format.hls,
          meta,
          requestHeaders: { Referer: 'https://hdstream4u.com/' },
        },
      ];
    }

    // Fallback: try the download page for a direct MP4 link
    const code = url.pathname.replace(/\/+$/, '').split('/').at(-1) as string;
    const downloadUrl = new URL(`https://hdstream4u.com/download/${code}`);

    try {
      const downloadHtml = await this.fetcher.text(ctx, downloadUrl, { headers });
      const mp4Url = this.extractDirectUrl(downloadHtml);

      if (mp4Url) {
        return [
          {
            url: mp4Url,
            format: Format.mp4,
            meta,
            requestHeaders: { Referer: 'https://hdstream4u.com/' },
          },
        ];
      }
    } catch (error) {
      /* istanbul ignore next */
      this.logger.warn(`Failed to fetch HDStream4U download page: ${error}`);
    }

    return [];
  }

  private extractM3u8Url(html: string): URL | null {
    // Pattern 1: JWPlayer sources with file property containing m3u8
    // e.g. sources:[{file:"https://...master.m3u8",...}]
    const jwSourceMatch = html.match(/file\s*:\s*["']([^"']*\.m3u8[^"']*)["']/);
    if (jwSourceMatch?.[1]) {
      try {
        return new URL(jwSourceMatch[1]);
      } catch {
        // URL parsing failed, try next pattern
      }
    }

    // Pattern 2: Any URL containing master.m3u8
    const masterMatch = html.match(/(https?:\/\/[^\s"'<>]+master\.m3u8[^\s"'<>]*)/);
    if (masterMatch?.[1]) {
      try {
        return new URL(masterMatch[1]);
      } catch {
        // URL parsing failed, try next pattern
      }
    }

    // Pattern 3: Any URL ending in .m3u8 (possibly with query params)
    const m3u8Match = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/);
    if (m3u8Match?.[1]) {
      try {
        return new URL(m3u8Match[1]);
      } catch {
        // URL parsing failed
      }
    }

    return null;
  }

  private extractDirectUrl(html: string): URL | null {
    // Look for direct download links (MP4 or other video formats)
    const directMatch = html.match(/(https?:\/\/[^\s"'<>]+\.(?:mp4|mkv|avi)[^\s"'<>]*)/i);
    if (directMatch?.[1]) {
      try {
        return new URL(directMatch[1]);
      } catch {
        // URL parsing failed
      }
    }

    // Look for a download link with common patterns
    const downloadLinkMatch = html.match(/href\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>\s*(?:Download|Direct|Click)/i);
    if (downloadLinkMatch?.[1]) {
      try {
        return new URL(downloadLinkMatch[1]);
      } catch {
        // URL parsing failed
      }
    }

    return null;
  }
}
