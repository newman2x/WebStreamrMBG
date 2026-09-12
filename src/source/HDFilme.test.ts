import { createTestContext } from '../test';
import { Fetcher, TmdbId } from '../utils';
import { HDFilme } from './HDFilme';

const ctx = createTestContext({ de: 'on' });

describe('HDFilme', () => {
  let source: HDFilme;
  let fetcher: Fetcher;

  beforeEach(() => {
    fetcher = {
      json: jest.fn(),
      text: jest.fn(),
      head: jest.fn(),
    } as unknown as Fetcher;
    source = new HDFilme(fetcher);
  });

  test('source properties', () => {
    expect(source.id).toBe('hdfilme');
    expect(source.label).toBe('HDFilme');
    expect(source.baseUrl).toBe('https://hdfilme-tv.help');
  });

  test('handle movie stream page with data-link and iframe hosters', async () => {
    const searchHtml = '<div><a href="/stream/avatar-2009.html" title="Avatar 2009">Avatar</a></div>';
    const streamPageHtml = '<div><div data-link="//voe.sx/e/avatar"></div><div data-link="streamtape.com/e/123"></div><iframe src="https://streamtape.com/e/123"></iframe><a href="javascript:void(0)">Ignore</a></div>';
    (fetcher.json as jest.Mock).mockResolvedValueOnce({ title: 'Avatar', release_date: '2009-12-18' });
    (fetcher.text as jest.Mock)
      .mockResolvedValueOnce(searchHtml)
      .mockResolvedValueOnce(streamPageHtml);

    const streams = await source.handle(ctx, 'movie', new TmdbId(4001, undefined, undefined));
    expect(streams.length).toBeGreaterThanOrEqual(1);
  });

  test('handle movie stream with year match in search', async () => {
    const searchHtml = '<div><a href="/stream/dune-2021.html" title="Dune 2021">Dune</a></div>';
    const streamPageHtml = '<div><div data-link="https://voe.sx/e/dune"></div></div>';
    (fetcher.json as jest.Mock).mockResolvedValueOnce({ title: 'Dune', release_date: '2021-10-22' });
    (fetcher.text as jest.Mock)
      .mockResolvedValueOnce(searchHtml)
      .mockResolvedValueOnce(streamPageHtml);

    const streams = await source.handle(ctx, 'movie', new TmdbId(4005, undefined, undefined));
    expect(streams).toHaveLength(1);
  });

  test('handle no candidates found', async () => {
    const noResultsHtml = '<div>No results</div>';
    (fetcher.json as jest.Mock).mockResolvedValueOnce({ title: 'Unknown Movie', release_date: '2024-01-01' });
    (fetcher.text as jest.Mock).mockResolvedValueOnce(noResultsHtml);

    const streams = await source.handle(ctx, 'movie', new TmdbId(4002, undefined, undefined));
    expect(streams).toEqual([]);
  });

  test('handle search fetch throw gracefully', async () => {
    (fetcher.json as jest.Mock).mockResolvedValueOnce({ title: 'Broken Search', release_date: '2024-01-01' });
    (fetcher.text as jest.Mock).mockRejectedValueOnce(new Error('Search failed'));

    const streams = await source.handle(ctx, 'movie', new TmdbId(4006, undefined, undefined));
    expect(streams).toEqual([]);
  });

  test('handle empty stream page content gracefully', async () => {
    const searchHtml = '<div><a href="/stream/empty.html">Empty</a></div>';
    const emptyPageHtml = '<div></div>';
    (fetcher.json as jest.Mock).mockResolvedValueOnce({ title: 'Empty Movie', release_date: '2024-01-01' });
    (fetcher.text as jest.Mock)
      .mockResolvedValueOnce(searchHtml)
      .mockResolvedValueOnce(emptyPageHtml);

    const streams = await source.handle(ctx, 'movie', new TmdbId(4003, undefined, undefined));
    expect(streams).toEqual([]);
  });
});
