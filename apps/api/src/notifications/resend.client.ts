import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Resend } from 'resend';

import { EmailEventsService } from './email-events.service';
import { notificationsConfig } from './notifications.config';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendEmailInput {
  to: string[];
  bcc?: string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  /** Collapses a retry of the same logical send provider-side (24h window). */
  idempotencyKey?: string;
}

@Injectable()
export class ResendClient {
  private readonly resend: Resend;

  constructor(
    @Inject(notificationsConfig.KEY)
    private readonly config: ConfigType<typeof notificationsConfig>,
    private readonly emailEvents: EmailEventsService,
  ) {
    this.resend = new Resend(this.config.resendApiKey);
  }

  async send(input: SendEmailInput): Promise<string> {
    const { data, error } = await this.resend.emails.send(
      {
        from: this.config.from,
        to: input.to,
        bcc: input.bcc,
        subject: input.subject,
        html: input.html,
        ...(input.attachments?.length
          ? {
              attachments: input.attachments.map((a) => ({
                filename: a.filename,
                content: a.content.toString('base64'),
                ...(a.contentType ? { contentType: a.contentType } : {}),
              })),
            }
          : {}),
      },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
    );
    if (error) {
      throw new Error(`Resend error: ${error.name} — ${error.message}`);
    }
    const id = data?.id ?? '';
    if (id) {
      for (const recipient of input.to) {
        await this.emailEvents.recordSent({
          providerId: id,
          recipient,
          subject: input.subject,
        });
      }
    }
    return id;
  }
}
