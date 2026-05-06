import winston from 'winston';
import { createTestContext } from '../test';
import { FetcherMock } from '../utils';
import { ExtractorRegistry } from './ExtractorRegistry';
import { HDStream4U } from './HDStream4U';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new HDStream4U(new FetcherMock(`${__dirname}/__fixtures__/HDStream4U`), logger)]);

const ctx = createTestContext();

describe('HDStream4U', () => {
  test('supports hdstream4u.com URLs', () => {
    const extractor = new HDStream4U(new FetcherMock(`${__dirname}/__fixtures__/HDStream4U`), logger);
    expect(extractor.supports(ctx, new URL('https://hdstream4u.com/file/f1km2fch7mgd'))).toBe(true);
    expect(extractor.supports(ctx, new URL('https://hdstream4u.com/embed/f1km2fch7mgd'))).toBe(true);
    expect(extractor.supports(ctx, new URL('https://example.com/file/abc'))).toBe(false);
  });

  test('normalizes /file/ URL to /embed/ URL', () => {
    const extractor = new HDStream4U(new FetcherMock(`${__dirname}/__fixtures__/HDStream4U`), logger);
    const normalized = extractor.normalize(new URL('https://hdstream4u.com/file/f1km2fch7mgd'));
    expect(normalized.href).toBe('https://hdstream4u.com/embed/f1km2fch7mgd');
  });

  test('extracts m3u8 stream from embed page with file: pattern', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://hdstream4u.com/embed/f1km2fch7mgd'))).toMatchSnapshot();
  });

  test('extracts m3u8 with dynamic CDN path', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://hdstream4u.com/embed/abc123xyz'))).toMatchSnapshot();
  });

  test('extracts playlist m3u8 from embed page', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://hdstream4u.com/embed/dlmptest1'))).toMatchSnapshot();
  });

  test('extracts master.m3u8 URL without file: pattern', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://hdstream4u.com/embed/mastertest'))).toMatchSnapshot();
  });

  test('extracts .m3u8 URL without file: or master pattern', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://hdstream4u.com/embed/playlisttest'))).toMatchSnapshot();
  });

  test('falls back to download page for MP4 when no m3u8 in embed', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://hdstream4u.com/embed/nom3u8vid'))).toMatchSnapshot();
  });

  test('falls back to download page with href Download link', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://hdstream4u.com/embed/dlclickvid'))).toMatchSnapshot();
  });

  test('returns empty when no video links found on embed or download page', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://hdstream4u.com/embed/novideolink'))).toMatchSnapshot();
  });

  test('returns empty for not found page', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://hdstream4u.com/embed/notfound123'))).toMatchSnapshot();
  });
});
