import { Request, Response, Router } from 'express';
import { Extractor } from '../extractor';
import { Source } from '../source';
import { Config } from '../types';
import { buildManifest, getDefaultConfig } from '../utils';

export class ManifestController {
  public readonly router: Router;

  private readonly sources: Source[];
  private readonly extractors: Extractor[];

  public constructor(sources: Source[], extractors: Extractor[]) {
    this.router = Router();

    this.sources = sources;
    this.extractors = extractors;

    this.router.get('/manifest.json', this.getManifest.bind(this));
    this.router.get('/:config/manifest.json', this.getManifest.bind(this));
  }

  private getManifest(req: Request, res: Response) {
    let config: Config = getDefaultConfig();
    if (req.params['config']) {
      try {
        config = JSON.parse(req.params['config'] as string);
      } catch {
        res.status(400).json({ error: 'Invalid config: malformed JSON' });
        return;
      }
    }

    const manifest = buildManifest(this.sources, this.extractors, config);

    res.setHeader('Content-Type', 'application/json');
    res.send(manifest);
  };
}
