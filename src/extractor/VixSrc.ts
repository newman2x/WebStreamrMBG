import { Context, CountryCode, Format, InternalUrlResult, Meta } from '../types';
import { CustomRequestConfig, guessHeightFromPlaylist, hasMultiEnabled, iso639FromCountryCode } from '../utils';
import { Extractor } from './Extractor';

export class VixSrc extends Extractor {
  public readonly id = 'vixsrc';

  public readonly label = 'VixSrc';

  public override readonly ttl: number = 21600000; // 6h

  public supports(_ctx: Context, url: URL): boolean {
    return null !== url.host.match(/vixsrc/);
  }

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    const headers = {
      'Referer': 'https://vixsrc.to/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    };
    // VixSrc is now a Next.js app - HTML is JS-rendered and contains no player config.
    // The frontend calls /api/movie/{id} or /api/tv/{id}/{s}/{e} to get the embed src.
    const apiUrl = new URL(`/api${url.pathname}`, 'https://vixsrc.to');
    const apiJson = await this.fetcher.json(ctx, apiUrl, { headers }) as { src: string };
    const embedUrl = new URL(apiJson.src, 'https://vixsrc.to');
    // The embed page contains the player config (token, expires, url) in its HTML.
    const html = await this.fetcher.text(ctx, embedUrl, { headers });

    const tokenMatch = html.match(/['"]token['"]: ?['"](.*?)['"]/) as string[];
    const expiresMatch = html.match(/['"]expires['"]: ?['"](.*?)['"]/) as string[];
    const urlMatch = html.match(/url: ?['"](.*?)['"]/) as string[];

    const baseUrl = new URL(`${urlMatch[1]}`);
    const playlistUrl = new URL(`${baseUrl.origin}${baseUrl.pathname}.m3u8?${baseUrl.searchParams}`);
    playlistUrl.searchParams.append('token', tokenMatch[1] as string);
    playlistUrl.searchParams.append('expires', expiresMatch[1] as string);
    playlistUrl.searchParams.append('h', '1');

    const countryCodes = meta.countryCodes ?? [CountryCode.multi, ...(await this.determineCountryCodesFromPlaylist(ctx, playlistUrl, { headers }))];

    if (!hasMultiEnabled(ctx.config) && !countryCodes.some(countryCode => countryCode in ctx.config)) {
      return [];
    }

    return [
      {
        url: playlistUrl,
        format: Format.hls,
        meta: {
          ...meta,
          countryCodes,
          height: meta.height ?? await guessHeightFromPlaylist(ctx, this.fetcher, playlistUrl, { headers }),
        },
      },
    ];
  };

  private async determineCountryCodesFromPlaylist(ctx: Context, playlistUrl: URL, init?: CustomRequestConfig): Promise<CountryCode[]> {
    const playlist = await this.fetcher.text(ctx, playlistUrl, init);

    const countryCodes: CountryCode[] = [];

    (Object.keys(CountryCode) as CountryCode[]).forEach((countryCode) => {
      const iso639 = iso639FromCountryCode(countryCode);

      if (!countryCodes.includes(countryCode) && (new RegExp(`#EXT-X-MEDIA:TYPE=AUDIO.*LANGUAGE="${iso639}"`)).test(playlist)) {
        countryCodes.push(countryCode);
      }
    });

    return countryCodes;
  }
}
