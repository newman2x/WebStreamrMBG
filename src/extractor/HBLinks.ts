import * as cheerio from 'cheerio';
import winston from 'winston';
import { Context, InternalUrlResult, Meta } from '../types';
import { Fetcher, findCountryCodes, findHeight } from '../utils';
import { Extractor } from './Extractor';
import { HubCloud } from './HubCloud';
import { HubDrive } from './HubDrive';

export class HBLinks extends Extractor {
  public readonly id = 'hblinks';

  public readonly label = 'HUBLinks';

  public override readonly ttl: number = 120000; // 2 min

  public override readonly cacheVersion = 1;

  private readonly hubDrive: HubDrive;

  private readonly hubCloud: HubCloud;

  public constructor(fetcher: Fetcher, logger: winston.Logger, hubDrive: HubDrive, hubCloud: HubCloud) {
    super(fetcher, logger);

    this.hubDrive = hubDrive;
    this.hubCloud = hubCloud;
  }

  public supports(_ctx: Context, url: URL): boolean {
    return url.host.toLowerCase() === 'hblinks.dad';
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

    // Extract quality/language info from the page title
    const pageTitle = $('title').text().trim();
    const countryCodes = [...new Set([...meta.countryCodes ?? [], ...findCountryCodes(pageTitle)])];
    const height = meta.height ?? findHeight(pageTitle);
    const updatedMeta = { ...meta, countryCodes, height, title: pageTitle || meta.title };

    const results: InternalUrlResult[] = [];

    // Process ALL link types found on the page (not priority-fallback).
    // A single hblinks page can contain multiple quality options across
    // different hosts (e.g. 1080p on HubCDN, 4K on HubCloud), so we
    // extract from every link and aggregate all results.

    // HubCDN links (hubcdn.fans) — these contain direct Google video URLs
    const hubCdnLinks = this.extractLinks($, url, /hubcdn\.fans/);
    for (const cdnUrl of hubCdnLinks) {
      try {
        const cdnResults = await this.hubDrive.extract(ctx, cdnUrl, updatedMeta);
        results.push(...cdnResults);
      } catch {
        // Skip failed HubCDN extractions
      }
    }

    // HubCloud links — handles redirect → download links page
    const hubCloudLinks = this.extractLinks($, url, /hubcloud/);
    for (const cloudUrl of hubCloudLinks) {
      try {
        const cloudResults = await this.hubCloud.extract(ctx, cloudUrl, updatedMeta);
        results.push(...cloudResults);
      } catch {
        // Skip failed HubCloud extractions
      }
    }

    // HubDrive links — delegates to HubCloud for hubdrive.* URLs
    const hubDriveLinks = this.extractLinks($, url, /hubdrive/);
    for (const driveUrl of hubDriveLinks) {
      try {
        const driveResults = await this.hubDrive.extract(ctx, driveUrl, updatedMeta);
        results.push(...driveResults);
      } catch {
        // Skip failed HubDrive extractions
      }
    }

    return results;
  }

  /**
   * Extract links matching a host pattern from the page.
   * Deduplicates by URL to avoid processing the same link twice.
   */
  private extractLinks($: cheerio.CheerioAPI, pageUrl: URL, hostPattern: RegExp): URL[] {
    const links: URL[] = [];
    const seen = new Set<string>();

    $('a[href]').each((_i, el) => {
      const href = $(el).attr('href');
      if (href && hostPattern.test(href)) {
        try {
          const parsedUrl = new URL(href, pageUrl);
          const key = parsedUrl.href;
          if (!seen.has(key)) {
            seen.add(key);
            links.push(parsedUrl);
          }
        } catch {
          // Skip invalid URLs
        }
      }
    });

    return links;
  }
}
