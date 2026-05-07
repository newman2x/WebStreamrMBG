import { Request, Response } from 'express';
import { Context } from '../types';
import { getDefaultConfig } from './config';
import { envGet } from './env';

function readBeamupHost(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require('../../beamup-host.json') as { host?: string };
    /* istanbul ignore next */
    return config.host;
  } catch {
    /* istanbul ignore next */
    return undefined;
  }
}
const beamupHost: string | undefined = readBeamupHost();

function resolveHostUrl(req: Request): URL {
  const envHost = envGet('HOST') ?? envGet('BEAMUP_HOST') ?? beamupHost;
  const hostname = envHost ? envHost.replace(/^\/\//, '') : /* istanbul ignore next */ req.host;
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = typeof forwardedProto === 'string'
    ? (forwardedProto.split(',')[0]?.trim() || req.protocol)
    : req.protocol;
  return new URL(`${protocol}://${hostname}`);
}

export const contextFromRequestAndResponse = (req: Request, res: Response): Context => {
  return {
    hostUrl: resolveHostUrl(req),
    id: res.getHeader('X-Request-ID') as string,
    ...(req.ip && { ip: req.ip }),
    config: (() => {
      if (!req.params['config']) return getDefaultConfig();
      try {
        return JSON.parse(req.params['config'] as string);
      } catch {
        throw new Error('Invalid config: malformed JSON');
      }
    })(),
  };
};
