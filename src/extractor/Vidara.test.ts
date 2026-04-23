import winston from 'winston';
import { createTestContext } from '../test';
import { FetcherMock } from '../utils';
import { Vidara } from './Vidora';

// Setup silent logger for a clean test output
const logger = winston.createLogger({ 
  transports: [new winston.transports.Console({ silent: true })] 
});

// Mock fetcher pointing to your Vidara fixtures directory
const fetcher = new FetcherMock(`${__dirname}/__fixtures__/Vidara`);
const vidara = new Vidara(fetcher, logger);
const ctx = createTestContext();

describe('Vidara Extractor', () => {
  test('supports valid domains', () => {
    expect(vidara.supports(ctx, new URL('https://vidara.to/v/MKbY8mLNOWdVG'))).toBe(true);
    expect(vidara.supports(ctx, new URL('https://vidara.to/e/q2bWhcs5rpSof'))).toBe(true);
    expect(vidara.supports(ctx, new URL('https://vidara.to/v/VhvIDJk6qfLXI'))).toBe(false);
  });

  test('Movie extraction (Happy Path)', async () => {
    // This expects fixtures for:
    // 1. GET https://vidara.to/v/12345
    // 2. POST https://vidara.to/api/stream (returning streaming_url)
    // 3. GET [streaming_url] (for guessHeightFromPlaylist)
    const url = new URL('https://vidara.to/v/12345');
    const result = await vidara.handle(ctx, url);

    expect(result).toMatchSnapshot();
  });

  test('TV Show extraction with specific filecode', async () => {
    const url = new URL('https://vidara.so/e/episode-id');
    const result = await vidara.handle(ctx, url);

    expect(result).toMatchSnapshot();
    expect(result[0].format).toBe('hls');
  });

  test('Throws error on invalid URL format (missing filecode)', async () => {
    const url = new URL('https://vidara.to/about-us');
    
    // Using handle which calls extractInternal
    await expect(vidara.handle(ctx, url)).rejects.toThrow('Could not find filecode in URL');
  });

  test('Throws error when API response is empty', async () => {
    // This requires a fixture where the /api/stream returns { "streaming_url": null }
    const url = new URL('https://vidara.to/v/empty-response');
    
    await expect(vidara.handle(ctx, url)).rejects.toThrow('API response did not contain a streaming URL');
  });
});
