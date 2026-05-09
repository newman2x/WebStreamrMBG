import { createTestContext } from '../test';
import { FetcherMock, ImdbId } from '../utils';
import { VixSrc } from './VixSrc';

const ctx = createTestContext({ mediaFlowProxyUrl: 'http://localhost:8080' });

describe('VixSrc', () => {
  let source: VixSrc;

  beforeEach(() => {
    source = new VixSrc(new FetcherMock(`${__dirname}/__fixtures__/VixSrc`));
  });

  test('handle imdb black mirror s4e2', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt2085059', 4, 2));
    expect(streams).toMatchSnapshot();
  });

  test('handle imdb full metal jacket', async () => {
    const streams = await source.handle(ctx, 'series', new ImdbId('tt0093058', undefined, undefined));
    expect(streams).toMatchSnapshot();
  });

  test('returns empty when MediaFlowProxy is not configured', async () => {
    const noMfpCtx = createTestContext();
    const streams = await source.handle(noMfpCtx, 'series', new ImdbId('tt9999999', undefined, undefined));
    expect(streams).toEqual([]);
  });
});
