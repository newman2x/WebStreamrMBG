import winston from 'winston';
import { createTestContext } from '../test';
import { FetcherMock } from '../utils';
import { ExtractorRegistry } from './ExtractorRegistry';
import { FileMoon } from './FileMoon';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new FileMoon(new FetcherMock(`${__dirname}/__fixtures__/FileMoon`), logger)]);

const ctx = createTestContext({ mediaFlowProxyUrl: 'https://mediaflow.test.org', mediaFlowProxyPassword: 'test' });

describe('FileMoon', () => {
  test('extracts stream via MediaFlow extractor', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://filemoon.sx/e/c5lhlypfasmm'))).toMatchSnapshot();
  });

  test('supports alternative domain', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://z1ekv717.fun/d/wkhcbggdxf1d'))).toMatchSnapshot();
  });

  test('handles extraction failure gracefully', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://filemoon.sx/e/n7i8zodwjqr9'))).toMatchSnapshot();
  });
});
