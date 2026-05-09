import * as cheerio from 'cheerio';
import winston from 'winston';
import { Context, InternalUrlResult, Meta } from '../types';
import { Fetcher, findCountryCodes, findHeight } from '../utils';
import { Extractor } from './Extractor';
import { HubExtractor } from './HubExtractor';

const HUB_HOST_PATTERN = /hubcdn|hubcloud|hubdrive/;

export class HBLinks extends Extractor {
  public readonly id = 'hblinks';

  public readonly label = 'HUBLinks';

  public override readonly ttl: number = 120000; // 2 min

  public override readonly cacheVersion = 2;

  private readonly hubExtractor: HubExtractor;

  public constructor(fetcher: Fetcher, logger: winston.Logger, hubExtractor: HubExtractor) {
    super(fetcher, logger);

    this.hubExtractor = hubExtractor;
  }

  public supports(_ctx: Context, url: URL): boolean {
    return /hblinks/.test(url.host.toLowerCase());
  }

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    const headers = { Referer: meta.referer ?? url.href };

    let html: string;
    try {
      html = await this.fetcher.text(ctx, url, { headers });
    } catch {
      return [];
    }

    const $ = cheerio.load(html);

    const pageTitle = $('title').text().trim();
    const countryCodes = [...new Set([...meta.countryCodes ?? [], ...findCountryCodes(pageTitle)])];
    const height = meta.height ?? findHeight(pageTitle);
    const updatedMeta = { ...meta, countryCodes, height, title: pageTitle || meta.title };

    const results: InternalUrlResult[] = [];
    const hubLinks = this.extractHubLinks($, url);

    for (const hubUrl of hubLinks) {
      try {
        results.push(...await this.hubExtractor.extract(ctx, hubUrl, updatedMeta));
      } catch {
        // skip failed extraction
      }
    }

    return results;
  }

  // Extract all hub links (hubcdn, hubcloud, hubdrive), deduplicated by URL
  private extractHubLinks($: cheerio.CheerioAPI, pageUrl: URL): URL[] {
    const links: URL[] = [];
    const seen = new Set<string>();

    $('a[href]').each((_i, el) => {
      const href = $(el).attr('href');
      if (href && HUB_HOST_PATTERN.test(href)) {
        try {
          const parsedUrl = new URL(href, pageUrl);
          const key = parsedUrl.href;
          if (!seen.has(key)) {
            seen.add(key);
            links.push(parsedUrl);
          }
        } catch {
          // skip invalid URL
        }
      }
    });

    return links;
  }
}
