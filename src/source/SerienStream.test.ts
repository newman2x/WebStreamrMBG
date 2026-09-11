import { createTestContext } from '../test';
import { Fetcher, TmdbId } from '../utils';
import { SerienStream } from './SerienStream';

const ctx = createTestContext({ de: 'on' });

describe('SerienStream', () => {
  let source: SerienStream;
  let fetcher: Fetcher;

  beforeEach(() => {
    fetcher = {
      json: jest.fn(),
      text: jest.fn(),
      head: jest.fn(),
    } as unknown as Fetcher;
    source = new SerienStream(fetcher);
  });

  test('source properties', () => {
    expect(source.id).toBe('serienstream');
    expect(source.label).toBe('SerienStream');
    expect(source.baseUrl).toBe('https://serienstream.to');
  });

  test('handle empty result when no season', async () => {
    (fetcher.json as jest.Mock).mockResolvedValueOnce({ name: 'Breaking Bad', first_air_date: '2008-01-20' });
    const streams = await source.handle(ctx, 'series', new TmdbId(1399, undefined, undefined));
    expect(streams).toEqual([]);
  });

  test('handle series search and extraction with data-play-url', async () => {
    (fetcher.json as jest.Mock).mockResolvedValueOnce({ name: 'Breaking Bad', first_air_date: '2008-01-20' });
    (fetcher.text as jest.Mock)
      .mockResolvedValueOnce('<html><a href="/serie/stream/breaking-bad">Breaking Bad</a></html>')
      .mockResolvedValueOnce('<html><button data-play-url="https://voe.sx/e/123" data-provider-name="VOE" data-language-label="DE"></button></html>');

    const streams = await source.handle(ctx, 'series', new TmdbId(1399, 1, 1));
    expect(streams).toHaveLength(1);
    expect(streams[0]?.url.href).toBe('https://voe.sx/e/123');
  });

  test('handle series search and fallback redirect link when data-play-url missing', async () => {
    (fetcher.json as jest.Mock).mockResolvedValueOnce({ name: 'Breaking Bad', first_air_date: '2008-01-20' });
    (fetcher.text as jest.Mock)
      .mockResolvedValueOnce('<html><a href="/serie/stream/breaking-bad">Breaking Bad</a></html>')
      .mockResolvedValueOnce('<html><a href="/redirect/456">Stream Link</a></html>');

    const streams = await source.handle(ctx, 'series', new TmdbId(1400, 1, 1));
    expect(streams).toHaveLength(1);
    expect(streams[0]?.url.href).toBe('https://serienstream.to/redirect/456');
  });

  test('handle series search fallback and redirect links', async () => {
    (fetcher.json as jest.Mock).mockResolvedValueOnce({ name: 'Test Series', first_air_date: '2020-01-01' });
    (fetcher.text as jest.Mock)
      .mockRejectedValueOnce(new Error('Search failed'))
      .mockResolvedValueOnce('<html><a href="/redirect/456">Stream</a></html>');

    const streams = await source.handle(ctx, 'series', new TmdbId(1001, 1, 1));
    expect(streams).toHaveLength(1);
    expect(streams[0]?.url.href).toBe('https://serienstream.to/redirect/456');
  });

  test('handle fetch error gracefully', async () => {
    (fetcher.json as jest.Mock).mockResolvedValueOnce({ name: 'Test Series', first_air_date: '2020-01-01' });
    (fetcher.text as jest.Mock)
      .mockResolvedValueOnce('<html></html>')
      .mockResolvedValueOnce('');

    const streams = await source.handle(ctx, 'series', new TmdbId(1002, 1, 1));
    expect(streams).toEqual([]);
  });
});
