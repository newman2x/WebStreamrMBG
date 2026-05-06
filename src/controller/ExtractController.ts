import { Mutex } from 'async-mutex';
import { Request, Response, Router } from 'express';
import winston from 'winston';
import { ExtractorRegistry } from '../extractor';
import { contextFromRequestAndResponse, Fetcher } from '../utils';

const EXTRACT_TIMEOUT_MS = 30_000;

export class ExtractController {
  public readonly router: Router;

  private readonly logger: winston.Logger;
  private readonly extractorRegistry: ExtractorRegistry;

  private readonly locks = new Map<string, Mutex>();

  public constructor(logger: winston.Logger, _fetcher: Fetcher, extractorRegistry: ExtractorRegistry) {
    this.router = Router();

    this.logger = logger;
    this.extractorRegistry = extractorRegistry;

    this.router.get('/extract', this.extract.bind(this));
  }

  private async extract(req: Request, res: Response) {
    if (req.method !== 'GET') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const ctx = contextFromRequestAndResponse(req, res);

    const index = parseInt(req.query['index'] as string);
    const url = new URL(req.query['url'] as string);

    this.logger.info(`Lazy extract index ${index} of URL ${url} for ip ${ctx.ip}`, ctx);

    let mutex = this.locks.get(url.href);
    if (!mutex) {
      mutex = new Mutex();
      this.locks.set(url.href, mutex);
    }

    let timedOut = false;

    const extraction = mutex.runExclusive(async () => {
      const urlResults = await this.extractorRegistry.handle(ctx, url);

      if (timedOut) {
        this.logger.info(`Lazy extract completed after client timeout — result cached for URL ${url}`, ctx);
        return;
      }

      const urlResult = urlResults[index];
      if (!urlResult || urlResult.error) {
        res.status(503).send('Service Unavailable');
        return;
      }

      res.redirect(urlResult.url.href);
    });

    const timeout = new Promise<void>((resolve) => {
      setTimeout(() => {
        if (!res.headersSent) {
          timedOut = true;
          this.logger.warn(`Lazy extract timed out after ${EXTRACT_TIMEOUT_MS}ms for URL ${url}`, ctx);
          res.status(504).send('Gateway Timeout');
        }
        resolve();
      }, EXTRACT_TIMEOUT_MS);
    });

    await Promise.race([extraction, timeout]);

    if (!mutex.isLocked()) {
      this.locks.delete(url.href);
    }
  };
}
