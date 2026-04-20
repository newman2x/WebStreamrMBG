import * as cheerio from 'cheerio';
import { NotFoundError } from '../error';
import { Context, Format, InternalUrlResult, Meta } from '../types';
import { guessHeightFromPlaylist } from '../utils';
import { Extractor } from './Extractor';

export class Vidara extends Extractor {
  public readonly id = 'vidara';
  public readonly label = 'Vidara';

  public supports(_ctx: Context, url: URL): boolean {
  // This regex matches vidara.so, vidara.to, and any other variations
  return /vidara\.(so|to)/.test(url.host);
}

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    const html = await this.fetcher.text(ctx, url);
    const $ = cheerio.load(html);

    // 1. Extract filecode from the URL path
    // Example path: /e/q2bWhcs5rpSof -> filecode: q2bWhcs5rpSof
    const filecodeMatch = url.pathname.match(/\/(?:e|v|f)\/([a-zA-Z0-9]+)/);
    if (!filecodeMatch) {
      throw new NotFoundError('Could not find filecode in URL');
    }
    const filecode = filecodeMatch[1];

    // 2. The site uses a POST request to /api/stream to get the actual HLS link
    // This replicates the fetch() logic found in the site's script
    const apiUrl = new URL('/api/stream', url.origin);
    
    const response = await this.fetcher.json<{
      streaming_url?: string;
      title?: string;
      thumbnail?: string;
    }>(ctx, apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer': url.href,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        filecode: filecode,
        device: 'web'
      }),
    });

    if (!response.streaming_url) {
      throw new NotFoundError('API response did not contain a streaming URL');
    }

    const playlistUrl = new URL(response.streaming_url);

    // 3. Extract metadata
    const pageTitle = $('title').text().trim();
    const videoTitle = response.title || pageTitle || meta.title;

    // 4. Determine quality (height) from the playlist
    const height = await guessHeightFromPlaylist(ctx, this.fetcher, playlistUrl, {
      headers: { Referer: url.href }
    });

    return [
      {
        url: playlistUrl,
        format: Format.hls,
        meta: {
          ...meta,
          title: videoTitle,
          height: height || meta.height,
        },
        requestHeaders: {
          'Referer': url.href,
          'User-Agent': ctx.userAgent, // Essential for token validation
        },
      },
    ];
  }
}
