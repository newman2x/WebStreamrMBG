import { createDecipheriv, createHash } from 'node:crypto';
import { Cacheable, CacheableMemory, Keyv } from 'cacheable';
import { Context, Format, InternalUrlResult, Meta } from '../types';
import { Fetcher, guessHeightFromPlaylist } from '../utils';
import { Extractor } from './Extractor';

const API_KEY_URL = 'https://core.vidzee.wtf/api-key';
const SERVER_API_URL = 'https://player.vidzee.wtf/api/server';
const ENCRYPTION_KEY_SECRET = '4f2a9c7d1e8b3a6f0d5c2e9a7b1f4d8c';

// Cache the decrypted API key for 1 hour
export const apiKeyCache = new Cacheable({
  primary: new Keyv({ store: new CacheableMemory({ lruSize: 10 }) }),
  ttl: 3600000,
});

interface VidzeeServerResponse {
  headers?: Record<string, string>;
  provider?: string;
  url?: {
    lang: string;
    link: string;
    type: string;
    message?: string;
    name: string;
    flag: string;
  }[];
  tracks?: { lang: string; url: string }[];
  error?: string;
  server?: string;
  id?: string;
}

/**
 * Decrypt the API key from the base64-encoded AES-GCM encrypted response.
 */
export async function decryptApiKey(encryptedBase64: string): Promise<string> {
  const encrypted = Buffer.from(encryptedBase64, 'base64');

  if (encrypted.length <= 28) {
    throw new Error('Invalid API key response: too short');
  }

  const iv = encrypted.subarray(0, 12);
  const authTag = encrypted.subarray(12, 28);
  const ciphertext = encrypted.subarray(28);

  // Derive the key using SHA-256 of the secret
  const derivedKey = createHash('sha256').update(ENCRYPTION_KEY_SECRET).digest();

  const decipher = createDecipheriv('aes-256-gcm', derivedKey, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return decrypted.toString('utf8');
}

/**
 * Decrypt a server URL link using AES-CBC.
 */
function decryptServerUrl(encryptedLink: string, apiKey: string): string {
  try {
    const decoded = Buffer.from(encryptedLink, 'base64').toString('utf8');
    const colonIndex = decoded.indexOf(':');

    if (colonIndex === -1) {
      return '';
    }

    const ivBase64 = decoded.substring(0, colonIndex);
    const ciphertextBase64 = decoded.substring(colonIndex + 1);

    if (!ivBase64 || !ciphertextBase64) {
      return '';
    }

    const iv = Buffer.from(ivBase64, 'base64');
    const key = Buffer.alloc(32);
    key.write(apiKey, 'utf8');

    const ciphertext = Buffer.from(ciphertextBase64, 'base64');

    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

export class Vidzee extends Extractor {
  public readonly id = 'vidzee';

  public readonly label = 'VidZee';

  public override readonly ttl: number = 10800000; // 3h

  public constructor(fetcher: Fetcher) {
    super(fetcher);
  }

  public supports(_ctx: Context, url: URL): boolean {
    return url.host === 'player.vidzee.wtf' || url.host.endsWith('.vidzee.wtf');
  }

  protected async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    // Parse the URL to extract TMDB ID, season, episode, and server
    const { tmdbId, season, episode, serverId } = this.parseUrl(url);

    if (!tmdbId) {
      return [];
    }

    // Fetch and decrypt the API key (cached)
    const apiKey = await this.getApiKey(ctx);

    if (!apiKey) {
      return [];
    }

    // Build the server API URL
    const apiUrl = new URL(SERVER_API_URL);
    apiUrl.searchParams.set('id', tmdbId);
    apiUrl.searchParams.set('sr', serverId);

    if (season) {
      apiUrl.searchParams.set('ss', season);
      apiUrl.searchParams.set('ep', episode ?? '1');
    }

    // Fetch server data
    const serverResponse = await this.fetcher.json(ctx, apiUrl) as VidzeeServerResponse;

    if (serverResponse.error || !serverResponse.url?.length) {
      return [];
    }

    // Decrypt and collect URLs
    const results: InternalUrlResult[] = [];

    for (const stream of serverResponse.url) {
      const decryptedUrl = decryptServerUrl(stream.link, apiKey);

      if (!decryptedUrl) {
        continue;
      }

      const streamFormat = stream.type === 'hls' || decryptedUrl.includes('.m3u8')
        ? Format.hls
        : Format.mp4;

      const streamUrl = new URL(decryptedUrl);

      const result: InternalUrlResult = {
        url: streamUrl,
        format: streamFormat,
        label: `${stream.name} (${stream.flag}) - ${stream.lang}`,
        requestHeaders: {
          Referer: 'https://player.vidzee.wtf/',
          ...(serverResponse.headers?.['User-Agent'] ? { 'User-Agent': serverResponse.headers['User-Agent'] } : {}),
        },
        meta: {
          ...meta,
          title: `${stream.name} - ${stream.lang}`,
        },
      };

      // Try to guess resolution for HLS streams
      if (streamFormat === Format.hls) {
        try {
          const headers: Record<string, string> = {};
          if (serverResponse.headers?.['User-Agent']) {
            headers['User-Agent'] = serverResponse.headers['User-Agent'];
          }
          // istanbul ignore else -- meta is always set from spread above
          if (result.meta) {
            result.meta.height = await guessHeightFromPlaylist(ctx, this.fetcher, streamUrl, { headers });
          }
        } catch {
          // ignore resolution detection errors
        }
      }

      results.push(result);
    }

    return results;
  }

  private parseUrl(url: URL): { tmdbId: string | null; season: string | null; episode: string | null; serverId: string } {
    const pathParts = url.pathname.split('/').filter(Boolean);

    let tmdbId: string | null = null;
    let season: string | null = null;
    let episode: string | null = null;

    const movieIndex = pathParts.indexOf('movie');
    const tvIndex = pathParts.indexOf('tv');

    if (movieIndex !== -1 && pathParts[movieIndex + 1]) {
      tmdbId = pathParts[movieIndex + 1] ?? /* istanbul ignore next */ null;
    } else if (tvIndex !== -1 && pathParts[tvIndex + 1]) {
      tmdbId = pathParts[tvIndex + 1] ?? /* istanbul ignore next */ null;
      season = pathParts[tvIndex + 2] ?? /* istanbul ignore next */ null;
      episode = pathParts[tvIndex + 3] ?? /* istanbul ignore next */ null;
    }

    const serverId = url.searchParams.get('sr') ?? '4'; // Default to Nflix

    return { tmdbId, season, episode, serverId };
  }

  private async getApiKey(ctx: Context): Promise<string | null> {
    const cached = await apiKeyCache.get<string>('vidzee-api-key');
    if (cached) {
      return cached;
    }

    try {
      const encryptedKey = await this.fetcher.text(ctx, new URL(API_KEY_URL));
      const decryptedKey = await decryptApiKey(encryptedKey);

      await apiKeyCache.set('vidzee-api-key', decryptedKey);

      return decryptedKey;
    } catch {
      return null;
    }
  }
}
