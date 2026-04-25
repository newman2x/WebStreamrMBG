import { createTestContext } from '../test';
import { FetcherMock, TmdbId } from '../utils';
import { MovieBox } from './MovieBox';

const ctx = createTestContext();

describe('MovieBox', () => {
  let source: MovieBox;

  beforeEach(() => {
    source = new MovieBox(new FetcherMock(`${__dirname}/__fixtures__/MovieBox`));
  });

  test('handle movie avatar', async () => {
    const streams = await source.handle(ctx, 'movie', new TmdbId(19995, undefined, undefined));
    expect(streams).toMatchSnapshot();
  });

  test('handle tv breaking bad s1e1', async () => {
    const streams = await source.handle(ctx, 'series', new TmdbId(1396, 1, 1));
    expect(streams).toMatchSnapshot();
  });

  test('handle not found movie', async () => {
    const streams = await source.handle(ctx, 'movie', new TmdbId(9999999, undefined, undefined));
    expect(streams).toHaveLength(0);
  });

  test('handle movie with no resources available', async () => {
    const streams = await source.handle(ctx, 'movie', new TmdbId(7777777, undefined, undefined));
    expect(streams).toHaveLength(0);
  });

  test('handle movie with fallback match', async () => {
    const streams = await source.handle(ctx, 'movie', new TmdbId(8888888, undefined, undefined));
    expect(streams).toHaveLength(1);
    const stream = streams.find(s => s.meta.title === 'FallbackMovie (2022)');
    expect(stream).toBeDefined();
  });

  test('handle tv with no title match but fallback', async () => {
    const streams = await source.handle(ctx, 'series', new TmdbId(8888889, 1, 1));
    expect(streams).toHaveLength(1);
    const stream = streams.find(s => s.url.searchParams.get('subjectId') === '1111111111111111111');
    expect(stream).toBeDefined();
  });

  test('handle tv with no season match but fallback', async () => {
    const streams = await source.handle(ctx, 'series', new TmdbId(8888890, 3, 1));
    expect(streams).toHaveLength(1);
    const stream = streams.find(s => s.url.searchParams.get('se') === '3' && s.url.searchParams.get('ep') === '1');
    expect(stream).toBeDefined();
  });

  test('handle tv with no title match and no fallback', async () => {
    const streams = await source.handle(ctx, 'series', new TmdbId(8888891, 1, 1));
    expect(streams).toHaveLength(0);
  });

  test('handle tv with title match but no resources', async () => {
    const streams = await source.handle(ctx, 'series', new TmdbId(8888892, 1, 1));
    expect(streams).toHaveLength(0);
  });
});
