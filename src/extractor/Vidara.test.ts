import winston from 'winston';
import { createTestContext } from '../test';
import { FetcherMock } from '../utils';
import { ExtractorRegistry } from './ExtractorRegistry';
import { Vidara } from './Vidara';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new Vidara(new FetcherMock(`${__dirname}/__fixtures__/Vidara`), logger)]);

const ctx = createTestContext();

describe('Vidara', () => {
  test('vidara.to embed', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://vidara.to/e/abc123'))).toMatchSnapshot();
  });

  test('vidara.to without filecode returns error', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://vidara.to/'))).toMatchSnapshot();
  });

  test('vidara.to without streaming_url returns error', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://vidara.to/e/nostream'))).toMatchSnapshot();
  });
});
