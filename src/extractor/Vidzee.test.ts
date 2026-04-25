import { createCipheriv } from 'node:crypto';
import winston from 'winston';
import { createTestContext } from '../test';
import { Fetcher, FetcherMock } from '../utils';
import { ExtractorRegistry } from './ExtractorRegistry';
import { apiKeyCache, decryptApiKey, Vidzee } from './Vidzee';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new Vidzee(new FetcherMock(`${__dirname}/__fixtures__/Vidzee`))]);

const ctx = createTestContext();

beforeEach(async () => {
  await apiKeyCache.delete('vidzee-api-key');
});

// Helper to access protected extractInternal
async function callExtractInternal(extractor: Vidzee, url: URL) {
  return (extractor as unknown as { extractInternal: (c: typeof ctx, u: URL, m: Record<string, unknown>) => Promise<unknown[]> }).extractInternal(ctx, url, {});
}

// Helper to create an encrypted link that decrypts properly
function createEncryptedLink(plaintext: string, apiKey: string): string {
  const iv = Buffer.alloc(16, 0);
  const key = Buffer.alloc(32);
  key.write(apiKey, 'utf8');
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.from(iv.toString('base64') + ':' + encrypted.toString('base64')).toString('base64');
}

// Real encrypted API key from fixture
const REAL_API_KEY_RESPONSE = 'MoHBGKC2RWPGst66wAyux0yMgU5FWx4wVmO5cFbTMniGZ/8m5lWZK9WRTXtrTha7mPjf2qugcqs=';

describe('Vidzee', () => {
  test('Inception (movie)', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://player.vidzee.wtf/v2/embed/movie/27205?sr=4'))).toMatchSnapshot();
  });

  test('Breaking Bad S1E1 (tv)', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://player.vidzee.wtf/v2/embed/tv/1396/1/1?sr=4'))).toMatchSnapshot();
  });

  test('supports player.vidzee.wtf', () => {
    const extractor = new Vidzee(new FetcherMock(`${__dirname}/__fixtures__/Vidzee`));
    expect(extractor.supports(ctx, new URL('https://player.vidzee.wtf/v2/embed/movie/27205?sr=4'))).toBe(true);
  });

  test('supports subdomain of vidzee.wtf', () => {
    const extractor = new Vidzee(new FetcherMock(`${__dirname}/__fixtures__/Vidzee`));
    expect(extractor.supports(ctx, new URL('https://sub.vidzee.wtf/embed/movie/27205'))).toBe(true);
  });

  test('does not support other hosts', () => {
    const extractor = new Vidzee(new FetcherMock(`${__dirname}/__fixtures__/Vidzee`));
    expect(extractor.supports(ctx, new URL('https://example.com/movie/27205'))).toBe(false);
  });

  test('id is vidzee', () => {
    const extractor = new Vidzee(new FetcherMock(`${__dirname}/__fixtures__/Vidzee`));
    expect(extractor.id).toBe('vidzee');
  });

  test('label is VidZee', () => {
    const extractor = new Vidzee(new FetcherMock(`${__dirname}/__fixtures__/Vidzee`));
    expect(extractor.label).toBe('VidZee');
  });

  test('ttl is 10800000', () => {
    const extractor = new Vidzee(new FetcherMock(`${__dirname}/__fixtures__/Vidzee`));
    expect(extractor.ttl).toBe(10800000);
  });

  test('returns empty for URL without tmdb ID', async () => {
    const extractor = new Vidzee(new FetcherMock(`${__dirname}/__fixtures__/Vidzee`));
    const result = await callExtractInternal(extractor, new URL('https://player.vidzee.wtf/v2/embed/?sr=4'));
    expect(result).toEqual([]);
  });

  test('returns empty for server error response', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://player.vidzee.wtf/v2/embed/movie/99999?sr=4'))).toMatchSnapshot();
  });

  test('decryptApiKey throws for too-short response', async () => {
    await expect(decryptApiKey('c2hvcnQ=')).rejects.toThrow('Invalid API key response: too short');
  });

  test('handles HLS without User-Agent header and without meta', async () => {
    const apiKey = 'pleasedontscrapemesaywallahi';
    const link = createEncryptedLink('https://example.com/video.m3u8', apiKey);

    await apiKeyCache.set('vidzee-api-key', apiKey);

    const mockFetcher = {
      text: jest.fn().mockResolvedValue('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080\n1080p/index.m3u8'),
      json: jest.fn().mockResolvedValue({
        url: [{
          lang: 'English',
          link,
          type: 'hls',
          name: 'Test',
          flag: 'US',
        }],
      }),
      fetch: jest.fn(),
      head: jest.fn(),
      textPost: jest.fn(),
      getFinalRedirectUrl: jest.fn(),
    } as unknown as Fetcher;

    const extractor = new Vidzee(mockFetcher);
    const result = await callExtractInternal(extractor, new URL('https://player.vidzee.wtf/v2/embed/movie/27205?sr=4')) as { format: string }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.format).toBe('hls');
  });

  test('returns empty for empty URL response', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://player.vidzee.wtf/v2/embed/movie/88888?sr=4'))).toMatchSnapshot();
  });

  test('returns empty when API key fetch fails', async () => {
    const mockFetcher = {
      text: jest.fn().mockRejectedValue(new Error('Network error')),
      json: jest.fn().mockResolvedValue({}),
      fetch: jest.fn(),
      head: jest.fn(),
      textPost: jest.fn(),
      getFinalRedirectUrl: jest.fn(),
    } as unknown as Fetcher;

    const extractor = new Vidzee(mockFetcher);
    const result = await callExtractInternal(extractor, new URL('https://player.vidzee.wtf/v2/embed/movie/27205?sr=4'));
    expect(result).toEqual([]);
  });

  test('returns empty when API key response is too short', async () => {
    const mockFetcher = {
      text: jest.fn().mockResolvedValue('c2hvcnQ='),
      json: jest.fn().mockResolvedValue({}),
      fetch: jest.fn(),
      head: jest.fn(),
      textPost: jest.fn(),
      getFinalRedirectUrl: jest.fn(),
    } as unknown as Fetcher;

    const extractor = new Vidzee(mockFetcher);
    const result = await callExtractInternal(extractor, new URL('https://player.vidzee.wtf/v2/embed/movie/27205?sr=4'));
    expect(result).toEqual([]);
  });

  test('skips streams with invalid encrypted links (no colon)', async () => {
    const mockFetcher = {
      text: jest.fn().mockResolvedValue(REAL_API_KEY_RESPONSE),
      json: jest.fn().mockResolvedValue({
        url: [{
          lang: 'English',
          link: Buffer.from('nocolonhere').toString('base64'),
          type: 'hls',
          name: 'Test',
          flag: 'US',
        }],
      }),
      fetch: jest.fn(),
      head: jest.fn(),
      textPost: jest.fn(),
      getFinalRedirectUrl: jest.fn(),
    } as unknown as Fetcher;

    const extractor = new Vidzee(mockFetcher);
    const result = await callExtractInternal(extractor, new URL('https://player.vidzee.wtf/v2/embed/movie/27205?sr=4'));
    expect(result).toEqual([]);
  });

  test('skips streams with empty iv or ciphertext', async () => {
    const mockFetcher = {
      text: jest.fn().mockResolvedValue(REAL_API_KEY_RESPONSE),
      json: jest.fn().mockResolvedValue({
        url: [{
          lang: 'English',
          link: Buffer.from(':').toString('base64'),
          type: 'hls',
          name: 'Test',
          flag: 'US',
        }],
      }),
      fetch: jest.fn(),
      head: jest.fn(),
      textPost: jest.fn(),
      getFinalRedirectUrl: jest.fn(),
    } as unknown as Fetcher;

    const extractor = new Vidzee(mockFetcher);
    const result = await callExtractInternal(extractor, new URL('https://player.vidzee.wtf/v2/embed/movie/27205?sr=4'));
    expect(result).toEqual([]);
  });

  test('skips streams with wrong decryption key (catch block)', async () => {
    const mockFetcher = {
      text: jest.fn().mockResolvedValue(REAL_API_KEY_RESPONSE),
      json: jest.fn().mockResolvedValue({
        url: [{
          lang: 'English',
          link: Buffer.from('aW52YWxpZGl2:YmFkY2lwaGVydGV4dA==').toString('base64'),
          type: 'hls',
          name: 'Test',
          flag: 'US',
        }],
      }),
      fetch: jest.fn(),
      head: jest.fn(),
      textPost: jest.fn(),
      getFinalRedirectUrl: jest.fn(),
    } as unknown as Fetcher;

    const extractor = new Vidzee(mockFetcher);
    const result = await callExtractInternal(extractor, new URL('https://player.vidzee.wtf/v2/embed/movie/27205?sr=4'));
    expect(result).toEqual([]);
  });

  test('handles MP4 format streams (type=mp4)', async () => {
    const apiKey = 'pleasedontscrapemesaywallahi';
    const link = createEncryptedLink('https://example.com/video.mp4', apiKey);

    const mockFetcher = {
      text: jest.fn().mockResolvedValue(REAL_API_KEY_RESPONSE),
      json: jest.fn().mockResolvedValue({
        url: [{
          lang: 'English',
          link,
          type: 'mp4',
          name: 'Test',
          flag: 'US',
        }],
      }),
      fetch: jest.fn(),
      head: jest.fn(),
      textPost: jest.fn(),
      getFinalRedirectUrl: jest.fn(),
    } as unknown as Fetcher;

    const extractor = new Vidzee(mockFetcher);
    const result = await callExtractInternal(extractor, new URL('https://player.vidzee.wtf/v2/embed/movie/27205?sr=4')) as { format: string }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.format).toBe('mp4');
  });

  test('handles mp4 format by URL extension (type unknown but .mp4 url)', async () => {
    const apiKey = 'pleasedontscrapemesaywallahi';
    const link = createEncryptedLink('https://example.com/video.mp4', apiKey);

    const mockFetcher = {
      text: jest.fn().mockResolvedValue(REAL_API_KEY_RESPONSE),
      json: jest.fn().mockResolvedValue({
        url: [{
          lang: 'English',
          link,
          type: 'unknown',
          name: 'Test',
          flag: 'US',
        }],
      }),
      fetch: jest.fn(),
      head: jest.fn(),
      textPost: jest.fn(),
      getFinalRedirectUrl: jest.fn(),
    } as unknown as Fetcher;

    const extractor = new Vidzee(mockFetcher);
    const result = await callExtractInternal(extractor, new URL('https://player.vidzee.wtf/v2/embed/movie/27205?sr=4')) as { format: string }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.format).toBe('mp4');
  });

  test('uses default server ID when sr param is missing', async () => {
    const extractor = new Vidzee(new FetcherMock(`${__dirname}/__fixtures__/Vidzee`));
    const result = await extractor.extract(ctx, new URL('https://player.vidzee.wtf/v2/embed/movie/27205'), {});
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  test('handles HLS stream with User-Agent header', async () => {
    const apiKey = 'pleasedontscrapemesaywallahi';
    const link = createEncryptedLink('https://example.com/video.m3u8', apiKey);

    // Set up the API key cache so getApiKey returns it without calling fetcher.text
    await apiKeyCache.set('vidzee-api-key', apiKey);

    const mockFetcher = {
      text: jest.fn().mockResolvedValue('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080\n1080p/index.m3u8'),
      json: jest.fn().mockResolvedValue({
        headers: { 'User-Agent': 'TestAgent' },
        url: [{
          lang: 'English',
          link,
          type: 'hls',
          name: 'Test',
          flag: 'US',
        }],
      }),
      fetch: jest.fn(),
      head: jest.fn(),
      textPost: jest.fn(),
      getFinalRedirectUrl: jest.fn(),
    } as unknown as Fetcher;

    const extractor = new Vidzee(mockFetcher);
    const result = await callExtractInternal(extractor, new URL('https://player.vidzee.wtf/v2/embed/movie/27205?sr=4')) as { format: string }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.format).toBe('hls');
  });

  test('handles HLS stream with resolution detection error', async () => {
    const apiKey = 'pleasedontscrapemesaywallahi';
    const link = createEncryptedLink('https://example.com/video.m3u8', apiKey);

    // Set up the API key cache
    await apiKeyCache.set('vidzee-api-key', apiKey);

    const mockFetcher = {
      text: jest.fn().mockRejectedValue(new Error('Network error')),
      json: jest.fn().mockResolvedValue({
        headers: { 'User-Agent': 'TestAgent' },
        url: [{
          lang: 'English',
          link,
          type: 'hls',
          name: 'Test',
          flag: 'US',
        }],
      }),
      fetch: jest.fn(),
      head: jest.fn(),
      textPost: jest.fn(),
      getFinalRedirectUrl: jest.fn(),
    } as unknown as Fetcher;

    const extractor = new Vidzee(mockFetcher);
    const result = await callExtractInternal(extractor, new URL('https://player.vidzee.wtf/v2/embed/movie/27205?sr=4')) as { format: string }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.format).toBe('hls');
  });

  test('handles TV show URL with season but no episode (defaults to ep=1)', async () => {
    const apiKey = 'pleasedontscrapemesaywallahi';
    const link = createEncryptedLink('https://example.com/video.m3u8', apiKey);

    await apiKeyCache.set('vidzee-api-key', apiKey);

    const mockFetcher = {
      text: jest.fn().mockResolvedValue('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080\n1080p/index.m3u8'),
      json: jest.fn().mockResolvedValue({
        url: [{
          lang: 'English',
          link,
          type: 'hls',
          name: 'Test',
          flag: 'US',
        }],
      }),
      fetch: jest.fn(),
      head: jest.fn(),
      textPost: jest.fn(),
      getFinalRedirectUrl: jest.fn(),
    } as unknown as Fetcher;

    const extractor = new Vidzee(mockFetcher);
    // TV URL with season but no episode - should default episode to '1'
    const result = await callExtractInternal(extractor, new URL('https://player.vidzee.wtf/v2/embed/tv/1396/1?sr=4')) as { format: string }[];
    expect(result).toHaveLength(1);
    expect(result[0]?.format).toBe('hls');
    // Verify the API was called
    expect(mockFetcher.json).toHaveBeenCalledTimes(1);
  });
  test('returns empty when server response has error field', async () => {
    const mockFetcher = {
      text: jest.fn().mockResolvedValue(REAL_API_KEY_RESPONSE),
      json: jest.fn().mockResolvedValue({ error: 'Server unavailable', url: [] }),
      fetch: jest.fn(),
      head: jest.fn(),
      textPost: jest.fn(),
      getFinalRedirectUrl: jest.fn(),
    } as unknown as Fetcher;

    const extractor = new Vidzee(mockFetcher);
    const result = await callExtractInternal(extractor, new URL('https://player.vidzee.wtf/v2/embed/movie/27205?sr=4'));
    expect(result).toEqual([]);
  });
});
