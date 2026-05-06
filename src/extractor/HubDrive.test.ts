import winston from 'winston';
import { createTestContext } from '../test';
import { FetcherMock } from '../utils';
import { ExtractorRegistry } from './ExtractorRegistry';
import { HubCloud } from './HubCloud';
import { HubDrive } from './HubDrive';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(
  logger,
  [
    new HubDrive(
      new FetcherMock(`${__dirname}/__fixtures__/HubDrive`),
      logger,
      new HubCloud(new FetcherMock(`${__dirname}/__fixtures__/HubDrive/HubCloud`), logger),
    ),
  ],
);

const ctx = createTestContext();

describe('HubDrive', () => {
  test('handle avatar', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://hubdrive.space/file/7283903021'))).toMatchSnapshot();
  });

  test('handle missing hubcloud', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://hubdrive.space/file/2243124026'))).toMatchSnapshot();
  });

  test('handle hubcdn.fans with var reurl redirect', async () => {
    const result = await extractorRegistry.handle(ctx, new URL('https://hubcdn.fans/file/testcode123'));
    expect(result).toHaveLength(1);
    expect(result.some(r => r.url.href.includes('googleusercontent.com'))).toBe(true);
  });

  test('handle hubcdn.fans with googleusercontent fallback', async () => {
    const result = await extractorRegistry.handle(ctx, new URL('https://hubcdn.fans/file/fallbackcode456'));
    expect(result).toHaveLength(1);
    expect(result.some(r => r.url.href.includes('googleusercontent.com'))).toBe(true);
  });

  test('handle hubcdn.fans with no download link', async () => {
    const result = await extractorRegistry.handle(ctx, new URL('https://hubcdn.fans/file/nolink789'));
    expect(result).toEqual([]);
  });
  test('handle hubcdn.fans with a id="vd" link (new format)', async () => {
    const result = await extractorRegistry.handle(ctx, new URL('https://hubcdn.fans/file/vdlink789'));
    expect(result).toHaveLength(1);
    expect(result.some(r => r.url.href.includes('googleusercontent.com'))).toBe(true);
  });
});
