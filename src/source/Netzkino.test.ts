import { createTestContext } from '../test';
import { Fetcher, TmdbId } from '../utils';
import { Netzkino } from './Netzkino';

const ctx = createTestContext({ de: 'on' });

describe('Netzkino', () => {
  let source: Netzkino;
  let fetcher: Fetcher;

  beforeEach(() => {
    fetcher = {
      json: jest.fn(),
      text: jest.fn(),
      head: jest.fn(),
    } as unknown as Fetcher;
    source = new Netzkino(fetcher);
  });

  test('source properties', () => {
    expect(source.id).toBe('netzkino');
    expect(source.label).toBe('Netzkino');
    expect(source.baseUrl).toBe('https://netzkino.de');
  });

  test('handle movie search and stream extraction', async () => {
    (fetcher.json as jest.Mock)
      .mockResolvedValueOnce({ title: 'Big Buck Bunny', release_date: '2008-04-10' })
      .mockResolvedValueOnce({
        posts: [
          {
            title: 'Big Buck Bunny',
            custom_fields: { Streaming: ['//stream.netzkino.de/bbb.m3u8'] },
          },
        ],
      });

    const streams = await source.handle(ctx, 'movie', new TmdbId(6001, undefined, undefined));
    expect(streams).toHaveLength(1);
    expect(streams[0]?.url.href).toBe('https://stream.netzkino.de/bbb.m3u8');
  });

  test('handle post without streaming field or invalid url', async () => {
    (fetcher.json as jest.Mock)
      .mockResolvedValueOnce({ title: 'Invalid Movie', release_date: '2020-01-01' })
      .mockResolvedValueOnce({
        posts: [
          { title: 'No stream' },
          { title: 'Bad stream', custom_fields: { Streaming: ['not a valid url'] } },
        ],
      });

    const streams = await source.handle(ctx, 'movie', new TmdbId(6003, undefined, undefined));
    expect(streams).toEqual([]);
  });

  test('handle error or empty posts gracefully', async () => {
    (fetcher.json as jest.Mock)
      .mockResolvedValueOnce({ title: 'Nonexistent Movie', release_date: '2020-01-01' })
      .mockRejectedValueOnce(new Error('Netzkino API error'));

    const streams = await source.handle(ctx, 'movie', new TmdbId(6002, undefined, undefined));
    expect(streams).toEqual([]);
  });
});
