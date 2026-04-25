import winston from 'winston';
import { createTestContext } from '../test';
import { FetcherMock } from '../utils';
import { ExtractorRegistry } from './ExtractorRegistry';
import { MovieBox } from './MovieBox';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new MovieBox(new FetcherMock(`${__dirname}/__fixtures__/MovieBox`))]);

const ctx = createTestContext();

describe('MovieBox', () => {
  test('Avatar movie streams', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/download?subjectId=8906247916759695608&se=0&ep=0&detailPath=avatar-WLDIi21IUBa'))).toMatchSnapshot();
  });

  test('Breaking Bad S01E01 streams', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/download?subjectId=6207982430134357800&se=1&ep=1&detailPath=breaking-bad-ej6Bp0MCAo7'))).toMatchSnapshot();
  });

  test('No streams available', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/download?subjectId=9999999999999999999&se=0&ep=0&detailPath=notfound-abc123'))).toMatchSnapshot();
  });

  test('No subjectId returns empty', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/download?se=0&ep=0'))).toMatchSnapshot();
  });

  test('HLS stream', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/download?subjectId=4444444444444444444&se=0&ep=0&detailPath=hls-test'))).toMatchSnapshot();
  });

  test('URL without se/ep params uses defaults', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/download?subjectId=8906247916759695608'))).toMatchSnapshot();
  });

  test('Unknown format stream', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/download?subjectId=5555555555555555555&se=0&ep=0&detailPath=unknown-test'))).toMatchSnapshot();
  });

  test('MP4 format field without .mp4 in URL', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/download?subjectId=6666666666666666666&se=0&ep=0&detailPath=mp4-format-test'))).toMatchSnapshot();
  });

  test('Non-zero response code returns empty', async () => {
    expect(await extractorRegistry.handle(ctx, new URL('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/download?subjectId=7777777777777777777&se=0&ep=0&detailPath=error-code-test'))).toMatchSnapshot();
  });

  test('supports h5-api.aoneroom.com URLs', () => {
    const extractor = new MovieBox(new FetcherMock(`${__dirname}/__fixtures__/MovieBox`));
    expect(extractor.supports(ctx, new URL('https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/download?subjectId=123'))).toBe(true);
  });

  test('supports h5.aoneroom.com URLs', () => {
    const extractor = new MovieBox(new FetcherMock(`${__dirname}/__fixtures__/MovieBox`));
    expect(extractor.supports(ctx, new URL('https://h5.aoneroom.com/wefeed-h5-bff/web/subject/play?subjectId=123'))).toBe(true);
  });

  test('supports moviebox.ph URLs', () => {
    const extractor = new MovieBox(new FetcherMock(`${__dirname}/__fixtures__/MovieBox`));
    expect(extractor.supports(ctx, new URL('https://moviebox.ph/wefeed-h5api-bff/subject/download?subjectId=123'))).toBe(true);
  });

  test('does not support other URLs', () => {
    const extractor = new MovieBox(new FetcherMock(`${__dirname}/__fixtures__/MovieBox`));
    expect(extractor.supports(ctx, new URL('https://example.com/play?id=123'))).toBe(false);
  });
});
