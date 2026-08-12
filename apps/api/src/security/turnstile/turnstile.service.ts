import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { turnstileConfig } from './turnstile.config';

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string; errorCodes?: string[] };

interface SiteVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(
    @Inject(turnstileConfig.KEY)
    private readonly config: ConfigType<typeof turnstileConfig>,
    private readonly http: HttpService,
  ) {}

  get enabled(): boolean {
    return this.config.enabled;
  }

  async verify(token: string | undefined, ip?: string): Promise<VerifyResult> {
    if (!token) return { ok: false, reason: 'missing-token' };
    if (!this.config.secretKey) {
      this.logger.error(
        'TURNSTILE_ENABLED=true but TURNSTILE_SECRET_KEY is empty — refusing to fail open.',
      );
      return { ok: false, reason: 'misconfigured' };
    }
    const form = new URLSearchParams({
      secret: this.config.secretKey,
      response: token,
    });
    if (ip) form.set('remoteip', ip);
    try {
      const response = await firstValueFrom(
        this.http.post<SiteVerifyResponse>(this.config.verifyUrl, form, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: this.config.timeoutMs,
        }),
      );
      const data = response.data;
      if (data?.success) return { ok: true };
      return {
        ok: false,
        reason: 'rejected',
        errorCodes: data?.['error-codes'],
      };
    } catch (err) {
      const detail =
        err instanceof AxiosError ? err.message : (err as Error).message;
      this.logger.warn(`siteverify call failed: ${detail}`);
      return { ok: false, reason: 'transport-error' };
    }
  }
}
