import * as cheerio from 'cheerio';
import { NotFoundError } from '../error';
import { Context, Format, InternalUrlResult, Meta } from '../types';
import { Extractor } from './Extractor';

export class Veev extends Extractor {
  public readonly id = 'veev';
  public readonly label = 'Veev';

  public supports(_ctx: Context, url: URL): boolean {
    // Covers both the embed host and the CDN host
    return url.host.includes('veev.to') || url.host.includes('veevcdn.co');
  }

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    const html = await this.fetcher.text(ctx, url);
    const $ = cheerio.load(html);

    // 1. Target the <source> tag inside the plyr wrapper
    const videoSrc = $('video source').attr('src');
    const quality = $('video source').attr('size') || '720';

    if (!videoSrc) {
      throw new NotFoundError('Could not find video source tag');
    }

    const videoUrl = new URL(videoSrc);

    // 2. Fix for TS18048: Ensure title is a string before calling .trim()
    const rawTitle = $('title').text() || meta.title || 'Unknown Video';
    const cleanTitle = rawTitle.trim();

    return [
      {
        url: videoUrl,
        // Using Format.mp4 as indicated by the HTML type="video/mp4"
        format: Format.mp4, 
        meta: {
          ...meta,
          title: cleanTitle,
          height: parseInt(quality, 10),
        },
        requestHeaders: {
          'Referer': url.origin,
          // Fixed User-Agent to prevent CDN blocking
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      },
    ];
  }
}
