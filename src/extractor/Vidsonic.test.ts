import winston from 'winston';
import { createTestContext } from '../test';
import { FetcherMock } from '../utils';
import { ExtractorRegistry } from './ExtractorRegistry';
import { Vidssonic } from './Vidsonic';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new Vidsonic(new FetcherMock(`${__dirname}/__fixtures__/Vidsonic`))]);

const ctx = createTestContext();

describe('Vidsonic', () => {
  test('Movie ', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://vidsonic.net/e/vk1nj8cd2077'))).toMatchSnapshot();
  });

  test('Movie', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://vidsonic.net/e/8wg0n7ktvsxn'))).toMatchSnapshot();
  });

  test('Alternative domain (.so)', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://vidsonic.net/e/8d9dirx902q6'))).toMatchSnapshot();
  });
});
