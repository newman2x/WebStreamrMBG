import winston from 'winston';
import { createTestContext } from '../test';
import { Context, Format, InternalUrlResult, Meta } from '../types';
import { FetcherMock } from '../utils';
import { Extractor } from './Extractor';
import { ExtractorRegistry } from './ExtractorRegistry';
import { createExtractors } from './index';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, createExtractors(new FetcherMock(`${__dirname}/__fixtures__/ExtractorRegistry`), logger));

/** Mock extractor: two hosts resolve to same canonical URL */
class MockHubExtractor extends Extractor {
  public readonly id = 'mockhub';
  public readonly label = 'MockHub';
  public extractCount = 0;

  public supports(_ctx: Context, url: URL): boolean {
    return url.host === 'mockdrive.test' || url.host === 'mockcloud.test';
  }

  public override async normalizeAsync(): Promise<URL> {
    return new URL('https://mockcloud.test/same-file');
  }

  protected async extractInternal(_ctx: Context, _url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    this.extractCount++;
    return [{ url: new URL('https://mockcloud.test/same-file'), format: Format.unknown, meta }];
  }
}

describe('ExtractorRegistry', () => {
  const ctx = createTestContext();

  test('returns error result from extractor', async () => {
    const urlResult = await extractorRegistry.handle(ctx, new URL('https://some-url.test'));

    expect(urlResult).toMatchSnapshot();
  });

  test('returns external URLs if enabled by config', async () => {
    const urlResult = await extractorRegistry.handle({ ...ctx, config: { ...ctx.config, includeExternalUrls: 'on' } }, new URL('https://mixdrop.ag/e/3nzwveprim63or6'));

    expect(urlResult).toMatchSnapshot();
  });

  test('does not return external URLs by default', async () => {
    const urlResult = await extractorRegistry.handle(ctx, new URL('https://mixdrop.ag/e/l7v73zqrfdj19z'));

    expect(urlResult).toStrictEqual([]);
  });

  test('returns from memory cache if possible', async () => {
    const urlResults1 = await extractorRegistry.handle(ctx, new URL('https://dropload.io/lyo2h1snpe5c.html'));
    const urlResults2 = await extractorRegistry.handle(ctx, new URL('https://dropload.io/lyo2h1snpe5c.html'));

    expect(urlResults1).not.toStrictEqual([]);
    expect(urlResults2).not.toStrictEqual([]);
  });

  test('ignores not found errors but caches them', async () => {
    const urlResults1 = await extractorRegistry.handle(ctx, new URL('https://dropload.io/asdfghijklmn.html'));
    const urlResults2 = await extractorRegistry.handle(ctx, new URL('https://dropload.io/asdfghijklmn.html'));

    expect(urlResults1).toStrictEqual([]);
    expect(urlResults2).toStrictEqual([]);
  });

  test('returns external url for error', async () => {
    const urlResults = await extractorRegistry.handle(ctx, new URL('https://dropload.io/mocked-blocked.html'));
    expect(urlResults).toMatchSnapshot();
  });

  test('empty results are cached', async () => {
    const urlResults = await extractorRegistry.handle(ctx, new URL('https://dropload.io/asdfghijklmn.html'), { title: 'title' });
    expect(urlResults).toMatchSnapshot();
  });

  test('stats returns something', async () => {
    const stats = extractorRegistry.stats();

    expect(stats).toHaveProperty('urlResultCache');
    expect(stats.urlResultCache).toBeTruthy();
  });

  test('deduplicates concurrent extractions for the same canonical URL', async () => {
    // Slow extractor to guarantee both handle() calls overlap
    class SlowMockExtractor extends MockHubExtractor {
      protected override async extractInternal(ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
        await new Promise(r => setTimeout(r, 100));
        return super.extractInternal(ctx, url, meta);
      }
    }

    const mockExtractor = new SlowMockExtractor(new FetcherMock(`${__dirname}`), logger);
    const registry = new ExtractorRegistry(logger, [mockExtractor]);

    const [driveResults, cloudResults] = await Promise.all([
      registry.handle(ctx, new URL('https://mockdrive.test/file/123')),
      registry.handle(ctx, new URL('https://mockcloud.test/file/abc')),
    ]);

    // extractInternal called only once — in-flight dedup prevented duplicate extraction
    expect(mockExtractor.extractCount).toBe(1);
    expect(driveResults).toHaveLength(cloudResults.length);
  });
});
