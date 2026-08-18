import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export const authVerificationConfig = registerAs('authVerification', () => ({
  accessTokenTtlSeconds: Number(
    process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS ?? 3600,
  ),
  otpLength: Number(process.env.AUTH_OTP_LENGTH ?? 6),
  otpTtlSeconds: Number(process.env.AUTH_OTP_TTL_SECONDS ?? 900),
  otpMaxAttempts: Number(process.env.AUTH_OTP_MAX_ATTEMPTS ?? 5),
  otpResendCooldownSeconds: Number(
    process.env.AUTH_OTP_RESEND_COOLDOWN_SECONDS ?? 60,
  ),
  pendingTokenTtlSeconds: Number(
    process.env.AUTH_PENDING_TOKEN_TTL_SECONDS ?? 900,
  ),
  failedLoginAlertThreshold: Number(
    process.env.AUTH_FAILED_LOGIN_ALERT_THRESHOLD ?? 5,
  ),
  registrationReviewEmail: process.env.REGISTRATION_REVIEW_EMAIL ?? '',
  google: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI ?? '',
  },
  legalDocumentMaxBytes: Number(
    process.env.LEGAL_DOCUMENT_MAX_BYTES ?? 5 * 1024 * 1024,
  ),
  legalDocumentDirectory:
    process.env.LEGAL_DOCUMENT_STORAGE_DIR ?? '/var/lib/zemen/legal-documents',
  appPublicUrl: (process.env.APP_PUBLIC_URL ?? '').replace(/\/$/, ''),
  mail: {
    host: process.env.MAIL_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.MAIL_PORT ?? 587),
    secure: process.env.MAIL_SECURE === 'true',
    user: process.env.GMAIL_USER ?? '',
    password: process.env.GMAIL_APP_PASSWORD ?? '',
    from: process.env.AUTH_EMAIL_FROM || process.env.GMAIL_USER || '',
  },
}));

export const authVerificationValidationSchema = {
  AUTH_ACCESS_TOKEN_TTL_SECONDS: Joi.number()
    .integer()
    .min(300)
    .max(24 * 60 * 60)
    .default(3600),
  AUTH_OTP_LENGTH: Joi.number().integer().min(6).max(8).default(6),
  AUTH_OTP_TTL_SECONDS: Joi.number().integer().min(60).max(3600).default(900),
  AUTH_OTP_MAX_ATTEMPTS: Joi.number().integer().min(3).max(10).default(5),
  AUTH_OTP_RESEND_COOLDOWN_SECONDS: Joi.number()
    .integer()
    .min(15)
    .max(600)
    .default(60),
  AUTH_PENDING_TOKEN_TTL_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(3600)
    .default(900),
  AUTH_FAILED_LOGIN_ALERT_THRESHOLD: Joi.number()
    .integer()
    .min(3)
    .max(20)
    .default(5),
  REGISTRATION_REVIEW_EMAIL: Joi.string().email().optional().allow(''),
  GOOGLE_OAUTH_CLIENT_ID: Joi.string().optional().allow(''),
  GOOGLE_OAUTH_CLIENT_SECRET: Joi.string().optional().allow(''),
  GOOGLE_OAUTH_REDIRECT_URI: Joi.string().uri().optional().allow(''),
  LEGAL_DOCUMENT_MAX_BYTES: Joi.number()
    .integer()
    .min(1024)
    .max(20 * 1024 * 1024)
    .default(5 * 1024 * 1024),
  LEGAL_DOCUMENT_STORAGE_DIR: Joi.string().required(),
  MAIL_HOST: Joi.string().default('smtp.gmail.com'),
  MAIL_PORT: Joi.number().port().default(587),
  MAIL_SECURE: Joi.string().valid('true', 'false').default('false'),
  GMAIL_USER: Joi.string().email().optional().allow(''),
  GMAIL_APP_PASSWORD: Joi.string().optional().allow(''),
  AUTH_EMAIL_FROM: Joi.string().email().optional().allow(''),
};
