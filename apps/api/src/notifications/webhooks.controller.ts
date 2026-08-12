import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Webhook, WebhookVerificationError } from 'svix';

import { Public } from '../auth/public.decorator';
import { EmailEventsService } from './email-events.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly events: EmailEventsService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('resend')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Resend deliverability webhook (svix-signed).',
    description:
      'Configure the endpoint URL + copy the whsec_* secret from the Resend dashboard into RESEND_WEBHOOK_SECRET.',
  })
  async resend(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: unknown,
    @Headers('svix-id') svixId?: string,
    @Headers('svix-timestamp') svixTimestamp?: string,
    @Headers('svix-signature') svixSignature?: string,
  ): Promise<void> {
    const secret = this.config.get<string>('RESEND_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('RESEND_WEBHOOK_SECRET unset — refusing webhook.');
      throw new UnauthorizedException('Webhook secret not configured.');
    }
    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new UnauthorizedException('Missing svix headers.');
    }
    if (!req.rawBody) {
      throw new BadRequestException('Raw body unavailable.');
    }
    const wh = new Webhook(secret);
    try {
      wh.verify(req.rawBody.toString('utf8'), {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        throw new UnauthorizedException('Invalid webhook signature.');
      }
      throw err;
    }

    const parsed = body as Record<string, unknown>;
    const type = typeof parsed.type === 'string' ? parsed.type : null;
    const dataRaw = parsed.data as Record<string, unknown> | undefined;
    const providerId =
      typeof dataRaw?.email_id === 'string'
        ? dataRaw.email_id
        : typeof dataRaw?.id === 'string'
          ? dataRaw.id
          : null;
    if (!type || !providerId) {
      throw new BadRequestException('Malformed webhook payload.');
    }
    const at = typeof parsed.created_at === 'string'
      ? new Date(parsed.created_at)
      : new Date();
    const reason =
      typeof (dataRaw?.bounce as Record<string, unknown> | undefined)?.message === 'string'
        ? (dataRaw!.bounce as Record<string, string>).message
        : undefined;
    await this.events.applyWebhook({ type, providerId, at, reason });
  }
}
