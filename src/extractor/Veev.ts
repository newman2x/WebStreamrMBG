import * as cheerio from 'cheerio';
import { NotFoundError } from '../error';
import { Context, Format, InternalUrlResult, Meta } from '../types';
import { Extractor } from './Extractor';

export class Veev extends Extractor {
  public readonly id = 'veev';
  public readonly label = 'Veev';

  public supports(_ctx: Context, url: URL): boolean {
    // This host often appears in the source or the URL itself
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

    // 2. Extract title from meta or title tag
    const title = $('title').text() || meta.title;

    return [
      {
        url: videoUrl,
        // The snippet specifically says type="video/mp4"
        format: Format.mp4, 
        meta: {
          ...meta,
          title: title.trim(),
          height: parseInt(quality, 10),
        },
        requestHeaders: {
          'Referer': url.origin,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      },
    ];
  }
}
