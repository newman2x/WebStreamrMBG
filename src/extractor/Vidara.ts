import * as cheerio from 'cheerio';
import { NotFoundError } from '../error';
import { Context, Format, InternalUrlResult, Meta } from '../types';
import { guessHeightFromPlaylist } from '../utils';
import { Extractor } from './Extractor';

interface VidaraApiResponse {
  streaming_url?: string;
  title?: string;
}

export class Vidara extends Extractor {
  public readonly id = 'vidara';
  public readonly label = 'Vidara';

  public supports(_ctx: Context, url: URL): boolean {
    return /vidara\.(so|to)/.test(url.host);
  }

  protected async extractInternal(
    ctx: Context,
    url: URL,
    meta: Meta
  ): Promise<InternalUrlResult[]> {
    const html = await this.fetcher.text(ctx, url);
    const $ = cheerio.load(html);

    const filecodeMatch = url.pathname.match(/\/(?:e|v|f)\/([a-zA-Z0-9]+)/);
    if (!filecodeMatch) {
      throw new NotFoundError('Could not find filecode in URL');
    }

    const filecode = filecodeMatch[1];
    const apiUrl = new URL('/api/stream', url.origin);

    // ✅ FIX: remove generic and cast instead
    const response = (await this.fetcher.json(
      ctx,
      apiUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Referer: url.href,
          'X-Requested-With': 'XMLHttpRequest',
        },
        data: JSON.stringify({
          filecode,
          device: 'web',
        }),
      }
    )) as VidaraApiResponse;

    if (!response?.streaming_url) {
      throw new NotFoundError('API response did not contain a streaming URL');
    }

    const playlistUrl = new URL(response.streaming_url);

    const pageTitle = $('title').text().trim();
    const videoTitle = response.title || pageTitle || meta.title;

    const height = await guessHeightFromPlaylist(
      ctx,
      this.fetcher,
      playlistUrl,
      {
        headers: { Referer: url.href },
      }
    );

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
          Referer: url.href,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      },
    ];
  }
}
