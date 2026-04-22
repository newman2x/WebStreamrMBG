import * as cheerio from 'cheerio';
import { NotFoundError } from '../error';
import { Context, Format, InternalUrlResult, Meta } from '../types';
import { guessHeightFromPlaylist } from '../utils';
import { Extractor } from './Extractor';

export class Vidsonic extends Extractor {
  public readonly id = 'vidsonic';

  public readonly label = 'Vidsonic';

  public supports(_ctx: Context, url: URL): boolean {
    return url.host.includes('vidsonic.net');
  }

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    const html = await this.fetcher.text(ctx, url);

    // 1. Suche nach dem verschlüsselten String _0x1
    const encodedMatch = html.match(/const _0x1 = '([^']+)';/);

    // Validierung, um "possibly undefined" Fehler zu vermeiden
    if (!encodedMatch || !encodedMatch[1]) {
      throw new NotFoundError();
    }

    const encodedData: string = encodedMatch[1];

    // 2. Dekodierung: Hex -> String -> Reverse
    const cleanHex = encodedData.replace(/\|/g, '');
    let decoded = '';

    for (let i = 0; i < cleanHex.length; i += 2) {
      const hexPair = cleanHex.substring(i, i + 2);
      decoded += String.fromCharCode(parseInt(hexPair, 16));
    }

    const playlistUrlString = decoded.split('').reverse().join('');
    const playlistUrl = new URL(playlistUrlString);

    // 3. Qualität (Höhe) aus der Playlist ermitteln
    const height = await guessHeightFromPlaylist(ctx, this.fetcher, playlistUrl, {
      headers: { Referer: url.href },
    });

    // 4. Titel extrahieren
    const $ = cheerio.load(html);
    const title = $('title').text().replace('Vidsonic - ', '').trim();

    return [
      {
        url: playlistUrl,
        format: Format.hls,
        meta: {
          ...meta,
          title: title || meta.title,
          // Setzt die ermittelte Höhe (z.B. 1080, 720)
          height: height || meta.height,
        },
        requestHeaders: {
          Referer: url.href,
        },
      },
    ];
  }
}
