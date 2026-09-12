import { createTestContext } from '../test';
import { Fetcher, TmdbId } from '../utils';
import { AniWorld } from './AniWorld';

const ctx = createTestContext({ de: 'on' });

describe('AniWorld', () => {
  let source: AniWorld;
  let fetcher: Fetcher;

  beforeEach(() => {
    fetcher = {
      json: jest.fn(),
      text: jest.fn(),
      head: jest.fn(),
    } as unknown as Fetcher;
    source = new AniWorld(fetcher);
  });

  test('source properties', () => {
    expect(source.id).toBe('aniworld');
    expect(source.label).toBe('AniWorld');
    expect(source.baseUrl).toBe('https://aniworld.to');
  });

  test('handle anime series episode extraction', async () => {
    const searchDoc = '<div><a href="/anime/stream/naruto">Naruto</a></div>';
    const episodeDoc = '<div><button data-play-url="https://voe.sx/e/naruto1" data-provider-name="VOE" data-language-label="Ger-Sub"></button></div>';
    (fetcher.json as jest.Mock).mockResolvedValueOnce({ name: 'Naruto', first_air_date: '2002-10-03' });
    (fetcher.text as jest.Mock)
      .mockResolvedValueOnce(searchDoc)
      .mockResolvedValueOnce(episodeDoc);

    const streams = await source.handle(ctx, 'series', new TmdbId(2001, 1, 1));
    expect(streams).toHaveLength(1);
    expect(streams[0]?.url.href).toBe('https://voe.sx/e/naruto1');
  });

  test('handle anime series with redirect link fallback when no play-url button', async () => {
    const searchDoc = '<div><a href="/anime/stream/naruto">Naruto</a></div>';
    const redirectDoc = '<div><a href="/redirect/naruto1">Redirect Link</a></div>';
    (fetcher.json as jest.Mock).mockResolvedValueOnce({ name: 'Naruto', first_air_date: '2002-10-03' });
    (fetcher.text as jest.Mock)
      .mockResolvedValueOnce(searchDoc)
      .mockResolvedValueOnce(redirectDoc);

    const streams = await source.handle(ctx, 'series', new TmdbId(2004, 1, 1));
    expect(streams).toHaveLength(1);
    expect(streams[0]?.url.href).toBe('https://aniworld.to/redirect/naruto1');
  });

  test('handle anime movie extraction with redirect link fallback', async () => {
    const redirectDoc = '<div><a href="/redirect/789">Stream</a></div>';
    (fetcher.json as jest.Mock).mockResolvedValueOnce({ title: 'Your Name', release_date: '2016-08-26' });
    (fetcher.text as jest.Mock)
      .mockRejectedValueOnce(new Error('Search failed'))
      .mockResolvedValueOnce(redirectDoc);

    const streams = await source.handle(ctx, 'movie', new TmdbId(2002, undefined, undefined));
    expect(streams).toHaveLength(1);
    expect(streams[0]?.url.href).toBe('https://aniworld.to/redirect/789');
  });

  test('handle error gracefully', async () => {
    const emptyHtml = '<div></div>';
    (fetcher.json as jest.Mock).mockResolvedValueOnce({ name: 'Naruto', first_air_date: '2002-10-03' });
    (fetcher.text as jest.Mock)
      .mockResolvedValueOnce(emptyHtml)
      .mockResolvedValueOnce('');

    const streams = await source.handle(ctx, 'series', new TmdbId(2003, 1, 1));
    expect(streams).toEqual([]);
  });
});
