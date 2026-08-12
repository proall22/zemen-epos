import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export interface NotificationsConfig {
  enabled: boolean;
  resendApiKey: string;
  from: string;
  /** Fixed merchant inbox(es) that get a BCC copy of every notification. */
  merchantCopy: string[];
  logoUrl: string;
  /** Web app base URL, used to build "view document" links. */
  appPublicUrl: string;
  /** API base URL, used to build hosted QR image links for emails. */
  apiPublicUrl: string;
  redisUrl: string;
  /** Secret for signing buyer-facing public document links (HMAC). */
  publicLinkSecret: string;
  /** EchoWave SMS gateway. `enabled` adds an SMS channel alongside email. */
  sms: {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    shortCode: string;
  };
}

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const notificationsConfig = registerAs<NotificationsConfig>(
  'notifications',
  () => {
    const appPublicUrl = (process.env.APP_PUBLIC_URL ?? '').replace(/\/$/, '');
    return {
      enabled: process.env.NOTIFICATIONS_ENABLED === 'true',
      resendApiKey: process.env.RESEND_API_KEY ?? '',
      from: process.env.EMAIL_FROM ?? '',
      merchantCopy: splitList(process.env.EMAIL_MERCHANT_COPY),
      // Defaults to the Zemen-ePos wordmark hosted in the web app's public dir.
      logoUrl:
        process.env.EMAIL_LOGO_URL ||
        (appPublicUrl ? `${appPublicUrl}/zemen-epos-logo.svg` : ''),
      appPublicUrl,
      apiPublicUrl: (process.env.API_PUBLIC_URL ?? '').replace(/\/$/, ''),
      redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
      publicLinkSecret:
        process.env.PUBLIC_LINK_SECRET || process.env.JWT_SECRET || '',
      sms: {
        enabled: process.env.SMS_ENABLED === 'true',
        baseUrl: (process.env.SMS_BASE_URL ?? '').replace(/\/$/, ''),
        apiKey: process.env.SMS_API_KEY ?? '',
        shortCode: process.env.SMS_SHORT_CODE ?? '',
      },
    };
  },
);

// RESEND_API_KEY and EMAIL_FROM are only required when notifications are
// switched on, so local/dev runs don't need Resend credentials.
const requiredWhenEnabled = (schema: Joi.StringSchema) =>
  schema.when('NOTIFICATIONS_ENABLED', {
    is: 'true',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  });

// SMS is a separate, independently-toggled channel. Its gateway creds are only
// required when SMS_ENABLED=true, so email-only deployments need nothing extra.
const requiredWhenSmsEnabled = (schema: Joi.StringSchema) =>
  schema.when('SMS_ENABLED', {
    is: 'true',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  });

export const notificationsValidationSchema = {
  NOTIFICATIONS_ENABLED: Joi.string().valid('true', 'false').default('false'),
  RESEND_API_KEY: requiredWhenEnabled(Joi.string()),
  // Optional: only required if webhooks are configured on the Resend side.
  // Empty = webhook endpoint refuses every request with 401.
  RESEND_WEBHOOK_SECRET: Joi.string().optional().allow(''),
  EMAIL_FROM: requiredWhenEnabled(Joi.string()),
  EMAIL_MERCHANT_COPY: Joi.string().optional().allow(''),
  EMAIL_LOGO_URL: Joi.string().uri().optional().allow(''),
  APP_PUBLIC_URL: Joi.string().uri().optional().allow(''),
  API_PUBLIC_URL: Joi.string().uri().optional().allow(''),
  REDIS_URL: Joi.string().optional().allow(''),
  SMS_ENABLED: Joi.string().valid('true', 'false').default('false'),
  // EchoWave's SMS gateway is HTTPS — pin the scheme so a misconfigured
  // `http://` URL doesn't silently send the API key in plaintext.
  SMS_BASE_URL: requiredWhenSmsEnabled(Joi.string().uri({ scheme: ['https'] })),
  SMS_API_KEY: requiredWhenSmsEnabled(Joi.string()),
  SMS_SHORT_CODE: requiredWhenSmsEnabled(Joi.string()),
};
