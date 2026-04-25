import { Context, CountryCode, Format, InternalUrlResult, Meta } from '../types';
import { Extractor } from './Extractor';

interface MovieBoxDownload {
  format: string;
  id: string;
  url: string;
  resolution: number;
  size: string;
  duration: number;
  codecName: string;
}

interface MovieBoxCaption {
  id: string;
  lan: string;
  lanName: string;
  url: string;
  size: string;
  delay: number;
}

interface MovieBoxDownloadData {
  downloads: MovieBoxDownload[];
  captions: MovieBoxCaption[];
  limited: boolean;
  limitedCode: string;
  freeNum: number;
  hasResource: boolean;
}

interface MovieBoxDownloadResponse {
  code: number;
  message: string;
  data: MovieBoxDownloadData;
}

const API_BASE_URL = 'https://h5-api.aoneroom.com';
const DOWNLOAD_PATH = '/wefeed-h5api-bff/subject/download';

export class MovieBox extends Extractor {
  public readonly id = 'moviebox';

  public readonly label = 'MovieBox';

  public override readonly ttl: number = 10800000; // 3h

  public supports(_ctx: Context, url: URL): boolean {
    return null !== url.host.match(/moviebox|aoneroom/);
  }

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    const subjectId = url.searchParams.get('subjectId');
    const se = url.searchParams.get('se') ?? '0';
    const ep = url.searchParams.get('ep') ?? '0';
    const detailPath = url.searchParams.get('detailPath');

    if (!subjectId) {
      return [];
    }

    const downloadUrl = new URL(`${API_BASE_URL}${DOWNLOAD_PATH}`);
    downloadUrl.searchParams.set('subjectId', subjectId);
    downloadUrl.searchParams.set('se', se);
    downloadUrl.searchParams.set('ep', ep);
    if (detailPath) {
      downloadUrl.searchParams.set('detailPath', detailPath);
    }

    const response = await this.fetcher.json(ctx, downloadUrl, {
      headers: this.getApiHeaders(),
    }) as MovieBoxDownloadResponse;

    if (response.code !== 0 || !response.data?.downloads?.length) {
      return [];
    }

    const results: InternalUrlResult[] = [];
    const countryCodeArray = meta.countryCodes ?? [CountryCode.multi];

    for (const download of response.data.downloads) {
      const resolution = download.resolution || 0;
      const streamUrl = new URL(download.url);

      const isHls = streamUrl.href.includes('.m3u8');
      const formatUpper = download.format ? download.format.toUpperCase() : '';
      const isMp4 = streamUrl.href.includes('.mp4') || formatUpper === 'MP4';

      const format = isHls ? Format.hls : isMp4 ? Format.mp4 : Format.unknown;

      results.push({
        url: streamUrl,
        format,
        label: `${resolution}p`,
        requestHeaders: { Referer: 'https://videodownloader.site/' },
        meta: {
          ...meta,
          countryCodes: countryCodeArray,
          height: resolution || undefined,
        },
      });
    }

    return results;
  }

  private getApiHeaders(): Record<string, string> {
    return {
      'Accept': 'application/json',
      'X-Client-Info': '{"timezone":"UTC"}',
      'Referer': 'https://videodownloader.site/',
    };
  }
}
