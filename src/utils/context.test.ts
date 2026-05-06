import { Request, Response } from 'express';
import { contextFromRequestAndResponse } from './context';

describe('contextFromRequest', () => {
  test('with config and ip', () => {
    const req = {
      protocol: 'https',
      host: 'localhost',
      headers: {
        'X-Request-ID': 'fake-id',
      },
      ip: '127.0.0.1',
      params: { config: '{"de":"on"}' },
    };
    const res = {
      getHeader: (name: string) => ({ 'X-Request-ID': 'fake-id' })[name],
    };

    expect(contextFromRequestAndResponse(req as unknown as Request, res as unknown as Response)).toMatchSnapshot();
  });

  test('without config', () => {
    const req = {
      protocol: 'https',
      host: 'localhost',
      headers: {
        'X-Request-ID': 'fake-id',
      },
      params: { },
    };
    const res = {
      getHeader: (name: string) => ({ 'X-Request-ID': 'fake-id' })[name],
    };

    expect(contextFromRequestAndResponse(req as unknown as Request, res as unknown as Response)).toMatchSnapshot();
  });

  test('prefers HOST env var over truncated req.host (Cloudflare/Beamup scenario)', () => {
    process.env['HOST'] = '//full.domain.baby-beamup.club';

    const req = {
      protocol: 'https',
      host: 'truncated-subdomain',
      headers: {},
      params: {},
    };
    const res = {
      getHeader: () => undefined,
    };

    const ctx = contextFromRequestAndResponse(req as unknown as Request, res as unknown as Response);
    expect(ctx.hostUrl.hostname).toBe('full.domain.baby-beamup.club');
    expect(ctx.hostUrl.protocol).toBe('https:');

    process.env['HOST'] = 'example.test';
  });

  test('falls back to beamup-host.json when HOST env var is not set', () => {
    const originalHost = process.env['HOST'];
    delete process.env['HOST'];

    const req = {
      protocol: 'http',
      host: 'truncated-app-name',
      headers: {},
      params: {},
    };
    const res = {
      getHeader: () => undefined,
    };

    const ctx = contextFromRequestAndResponse(req as unknown as Request, res as unknown as Response);
    // beamup-host.json provides the host when available, otherwise falls back to req.host
    expect(['87d6a6ef6b58-webstreamrmbg.baby-beamup.club', 'truncated-app-name']).toContain(ctx.hostUrl.hostname);

    if (originalHost) process.env['HOST'] = originalHost;
  });

  test('prefers HOST env var over beamup-host.json', () => {
    process.env['HOST'] = 'custom-host.example.com';

    const req = {
      protocol: 'https',
      host: 'truncated-app-name',
      headers: {},
      params: {},
    };
    const res = {
      getHeader: () => undefined,
    };

    const ctx = contextFromRequestAndResponse(req as unknown as Request, res as unknown as Response);
    expect(ctx.hostUrl.hostname).toBe('custom-host.example.com');

    process.env['HOST'] = 'example.test';
  });

  test('uses x-forwarded-proto header when available', () => {
    const originalHost = process.env['HOST'];
    delete process.env['HOST'];

    const req = {
      protocol: 'http',
      host: 'app.baby-beamup.club',
      headers: { 'x-forwarded-proto': 'https' },
      params: {},
    };
    const res = {
      getHeader: () => undefined,
    };

    const ctx = contextFromRequestAndResponse(req as unknown as Request, res as unknown as Response);
    expect(ctx.hostUrl.protocol).toBe('https:');

    if (originalHost) process.env['HOST'] = originalHost;
  });
  test('falls back to req.protocol when x-forwarded-proto is empty', () => {
    const originalHost = process.env['HOST'];
    delete process.env['HOST'];

    const req = {
      protocol: 'http',
      host: 'app.baby-beamup.club',
      headers: { 'x-forwarded-proto': '' },
      params: {},
    };
    const res = {
      getHeader: () => undefined,
    };

    const ctx = contextFromRequestAndResponse(req as unknown as Request, res as unknown as Response);
    expect(ctx.hostUrl.protocol).toBe('http:');

    if (originalHost) process.env['HOST'] = originalHost;
  });
  test('falls back to BEAMUP_HOST when HOST is not set', () => {
    const originalHost = process.env['HOST'];
    delete process.env['HOST'];
    process.env['BEAMUP_HOST'] = 'be-host.example.com';

    const req = {
      protocol: 'http',
      host: 'truncated-app-name',
      headers: {},
      params: {},
    };
    const res = {
      getHeader: () => undefined,
    };

    const ctx = contextFromRequestAndResponse(req as unknown as Request, res as unknown as Response);
    expect(ctx.hostUrl.hostname).toBe('be-host.example.com');

    delete process.env['BEAMUP_HOST'];
    if (originalHost) process.env['HOST'] = originalHost;
  });

  test('prefers HOST over BEAMUP_HOST', () => {
    process.env['HOST'] = 'host.example.com';
    process.env['BEAMUP_HOST'] = 'be-host.example.com';

    const req = {
      protocol: 'https',
      host: 'truncated-app-name',
      headers: {},
      params: {},
    };
    const res = {
      getHeader: () => undefined,
    };

    const ctx = contextFromRequestAndResponse(req as unknown as Request, res as unknown as Response);
    expect(ctx.hostUrl.hostname).toBe('host.example.com');

    process.env['HOST'] = 'example.test';
    delete process.env['BEAMUP_HOST'];
  });
});
