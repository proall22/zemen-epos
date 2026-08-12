import { of, throwError } from 'rxjs';

import type { HttpService } from '@nestjs/axios';
import type { ConfigType } from '@nestjs/config';
import { AxiosError } from 'axios';

import type { turnstileConfig } from './turnstile.config';
import { TurnstileService } from './turnstile.service';

function makeHttp(
  handler: () => { status: number; data: unknown } | Error,
): HttpService {
  const post = jest.fn(() => {
    const out = handler();
    if (out instanceof Error) return throwError(() => out);
    return of({
      status: out.status,
      data: out.data,
      statusText: 'OK',
      headers: {},
      config: {},
    });
  });
  return { post } as unknown as HttpService;
}

function cfg(
  overrides: Partial<ConfigType<typeof turnstileConfig>> = {},
): ConfigType<typeof turnstileConfig> {
  return {
    enabled: true,
    secretKey: 'sek',
    verifyUrl: 'https://cf.test/siteverify',
    timeoutMs: 1000,
    ...overrides,
  };
}

describe('TurnstileService', () => {
  it('accepts a successful verification', async () => {
    const http = makeHttp(() => ({ status: 200, data: { success: true } }));
    const svc = new TurnstileService(cfg(), http);
    await expect(svc.verify('t', '1.2.3.4')).resolves.toEqual({ ok: true });
  });

  it('rejects when Cloudflare returns success=false with error codes', async () => {
    const http = makeHttp(() => ({
      status: 200,
      data: { success: false, 'error-codes': ['invalid-input-response'] },
    }));
    const svc = new TurnstileService(cfg(), http);
    await expect(svc.verify('t')).resolves.toEqual({
      ok: false,
      reason: 'rejected',
      errorCodes: ['invalid-input-response'],
    });
  });

  it('reports missing-token before reaching the network', async () => {
    const http = makeHttp(() => ({ status: 200, data: { success: true } }));
    const svc = new TurnstileService(cfg(), http);
    await expect(svc.verify(undefined)).resolves.toEqual({
      ok: false,
      reason: 'missing-token',
    });
  });

  it('refuses to fail open when the secret is unset', async () => {
    const http = makeHttp(() => ({ status: 200, data: { success: true } }));
    const svc = new TurnstileService(cfg({ secretKey: '' }), http);
    await expect(svc.verify('t')).resolves.toEqual({
      ok: false,
      reason: 'misconfigured',
    });
  });

  it('translates transport errors into a non-ok transport-error', async () => {
    const err = new AxiosError('timeout');
    const http = makeHttp(() => err);
    const svc = new TurnstileService(cfg(), http);
    await expect(svc.verify('t')).resolves.toEqual({
      ok: false,
      reason: 'transport-error',
    });
  });
});
