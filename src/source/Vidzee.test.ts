import { createTestContext } from '../test';
import { TmdbId } from '../utils';
import { Vidzee } from './Vidzee';

const ctx = createTestContext({ multi: 'on' });

describe('Vidzee', () => {
  let source: Vidzee;

  beforeEach(() => {
    source = new Vidzee({ text: jest.fn(), json: jest.fn(), fetch: jest.fn(), head: jest.fn(), textPost: jest.fn(), getFinalRedirectUrl: jest.fn() } as never);
  });

  test('handle tmdb inception movie', async () => {
    const streams = await source.handleInternal(ctx, 'movie', new TmdbId(27205, undefined, undefined));
    expect(streams).toMatchSnapshot();
  });

  test('handle tmdb breaking bad s1e1', async () => {
    const streams = await source.handleInternal(ctx, 'series', new TmdbId(1396, 1, 1));
    expect(streams).toMatchSnapshot();
  });

  test('id is vidzee', () => {
    expect(source.id).toBe('vidzee');
  });

  test('label is VidZee', () => {
    expect(source.label).toBe('VidZee');
  });

  test('contentTypes includes movie and series', () => {
    expect(source.contentTypes).toContain('movie');
    expect(source.contentTypes).toContain('series');
  });

  test('countryCodes includes multi', () => {
    expect(source.countryCodes).toContain('multi' as never);
  });
});
