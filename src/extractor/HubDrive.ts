import * as cheerio from 'cheerio';
import winston from 'winston';
import { Context, Format, InternalUrlResult, Meta } from '../types';
import { Fetcher } from '../utils';
import { Extractor } from './Extractor';
import { HubCloud } from './HubCloud';

export class HubDrive extends Extractor {
  public readonly id = 'hubdrive';

  public readonly label = 'HubDrive';

  public override readonly ttl: number = 120000; // 2 min

  public override readonly cacheVersion = 2;

  private readonly hubCloud: HubCloud;

  public constructor(fetcher: Fetcher, logger: winston.Logger, hubCloud: HubCloud) {
    super(fetcher, logger);

    this.hubCloud = hubCloud;
  }

  public supports(_ctx: Context, url: URL): boolean {
    return null !== url.host.match(/hubdrive|hubcdn\.fans/);
  }

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    const headers = { Referer: meta.referer ?? url.href };

    const html = await this.fetcher.text(ctx, url, { headers });

    if (url.host.includes('hubcdn.fans')) {
      return this.extractHubCdnResult(html, meta);
    }

    const $ = cheerio.load(html);

    const hubCloudUrl = $('a:contains("HubCloud")')
      .map((_i, el) => new URL($(el).attr('href') as string))
      .get(0);

    return hubCloudUrl ? this.hubCloud.extract(ctx, hubCloudUrl, meta) : [];
  };

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
        const directUrl = new URL(reurlMatch[1]);
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
}
