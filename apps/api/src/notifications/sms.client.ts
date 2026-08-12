import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { notificationsConfig } from './notifications.config';

/**
 * Thin wrapper around the EchoWave SMS gateway: a single authenticated POST.
 * Throws on a non-2xx so the queue worker retries — with the requested URL, the
 * final (post-redirect) URL, status and response body, so misconfig (wrong
 * base URL, or an http→https redirect that downgrades POST→GET → 405) is
 * obvious from the worker log instead of a bare "status code 405".
 */
@Injectable()
export class SmsClient {
  constructor(
    @Inject(notificationsConfig.KEY)
    private readonly config: ConfigType<typeof notificationsConfig>,
    private readonly http: HttpService,
  ) {}

  async send(to: string, message: string): Promise<void> {
    const url = `${this.config.sms.baseUrl}/api/v1/messages/sms/send`;
    try {
      await firstValueFrom(
        this.http.post(
          url,
          { to, from: this.config.sms.shortCode, message },
          {
            headers: {
              'X-API-KEY': this.config.sms.apiKey,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
    } catch (err) {
      if (err instanceof AxiosError) {
        const status = err.response?.status ?? 'network';
        // With follow-redirects, this is the URL actually hit after any 3xx.
        const finalUrl =
          (err.request?.res?.responseUrl as string | undefined) ?? url;
        const body = err.response?.data
          ? JSON.stringify(err.response.data).slice(0, 300)
          : err.message;
        throw new Error(
          `POST ${url} → ${finalUrl} failed (${status}): ${body}`,
        );
      }
      throw err;
    }
  }
}
