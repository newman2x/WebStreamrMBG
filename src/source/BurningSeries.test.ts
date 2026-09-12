import { createTestContext } from '../test';
import { Fetcher, TmdbId } from '../utils';
import { BurningSeries } from './BurningSeries';

const ctx = createTestContext({ de: 'on' });

describe('BurningSeries', () => {
  let source: BurningSeries;
  let fetcher: Fetcher;

  beforeEach(() => {
    fetcher = {
      json: jest.fn(),
      text: jest.fn(),
      head: jest.fn(),
    } as unknown as Fetcher;
    source = new BurningSeries(fetcher);
  });

  test('source properties', () => {
    expect(source.id).toBe('burningseries');
    expect(source.label).toBe('BurningSeries');
    expect(source.baseUrl).toBe('https://bs.to');
  });

  test('handle empty result when no season', async () => {
    (fetcher.json as jest.Mock).mockResolvedValueOnce({ name: 'Dexter', first_air_date: '2006-10-01' });
    const streams = await source.handle(ctx, 'series', new TmdbId(5001, undefined, undefined));
    expect(streams).toEqual([]);
  });

  test('handle series episode with hosters', async () => {
    const hosterData = '<div><ul class="hosters"><li><a href="/out/123">VOE</a></li></ul></div>';
    (fetcher.json as jest.Mock).mockResolvedValueOnce({ name: 'Dexter', first_air_date: '2006-10-01' });
    (fetcher.text as jest.Mock).mockResolvedValueOnce(hosterData);

    const streams = await source.handle(ctx, 'series', new TmdbId(5002, 1, 1));
    expect(streams).toHaveLength(1);
    expect(streams[0]?.url.href).toBe('https://bs.to/out/123');
  });

  test('handle fetch error gracefully', async () => {
    (fetcher.json as jest.Mock).mockResolvedValueOnce({ name: 'Dexter', first_air_date: '2006-10-01' });
    (fetcher.text as jest.Mock).mockResolvedValueOnce('');

    const streams = await source.handle(ctx, 'series', new TmdbId(5003, 1, 1));
    expect(streams).toEqual([]);
  });
});
