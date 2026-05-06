import winston from 'winston';
import { createTestContext } from '../test';
import { FetcherMock } from '../utils';
import { ExtractorRegistry } from './ExtractorRegistry';
import { StreamEmbed } from './StreamEmbed';

const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'nope' })] });
const extractorRegistry = new ExtractorRegistry(logger, [new StreamEmbed(new FetcherMock(`${__dirname}/__fixtures__/StreamEmbed`), logger)]);

const ctxWithoutMfp = createTestContext();
const ctxWithMfp = createTestContext({ mediaFlowProxyUrl: 'https://mediaflow.test.org', mediaFlowProxyPassword: 'test' });

describe('StreamEmbed', () => {
  test('watch.gxplayer.xyz without MediaFlow', async () => {
    expect(await extractorRegistry.handle(ctxWithoutMfp, new URL('https://watch.gxplayer.xyz/watch?v=MEKI92PU'))).toMatchSnapshot();
  });

  test('watch.gxplayer.xyz with MediaFlow', async () => {
    expect(await extractorRegistry.handle(ctxWithMfp, new URL('https://watch.gxplayer.xyz/watch?v=MEKI92PU'))).toMatchSnapshot();
  });

  test('video is not ready', async () => {
    expect(await extractorRegistry.handle(ctxWithoutMfp, new URL('https://watch.gxplayer.xyz/watch?v=PBO90WAS'))).toMatchSnapshot();
  });
});
