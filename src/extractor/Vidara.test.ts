import winston from 'winston';
import { createTestContext } from '../test';
import { FetcherMock } from '../utils';
import { ExtractorRegistry } from './ExtractorRegistry';
import { Vidara } from './Vidara';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new Vidara(new FetcherMock(`${__dirname}/__fixtures__/Vidara`))]);

const ctx = createTestContext();

describe('Vidara', () => {
  test('Movie ', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://vidara.to/v/MKbY8mLNOWdVG'))).toMatchSnapshot();
  });

  test('Movie', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://vidara.to/e/q2bWhcs5rpSof'))).toMatchSnapshot();
  });

  test('Alternative domain (.so)', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://vidara.so/v/MKbY8mLNOWdVG'))).toMatchSnapshot();
  });
});
