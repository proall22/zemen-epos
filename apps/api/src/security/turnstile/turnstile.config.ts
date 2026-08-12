import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export interface TurnstileConfig {
  enabled: boolean;
  secretKey: string;
  verifyUrl: string;
  timeoutMs: number;
}

export const turnstileConfig = registerAs<TurnstileConfig>('turnstile', () => ({
  enabled: process.env.TURNSTILE_ENABLED === 'true',
  secretKey: process.env.TURNSTILE_SECRET_KEY ?? '',
  verifyUrl:
    process.env.TURNSTILE_VERIFY_URL ??
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  timeoutMs: Number(process.env.TURNSTILE_TIMEOUT_MS ?? 4000),
}));

export const turnstileValidationSchema = {
  TURNSTILE_ENABLED: Joi.string().valid('true', 'false').default('false'),
  // Required only when enabled — validated at runtime by the service so a
  // dev stack with TURNSTILE_ENABLED=false doesn't need to set the secret.
  TURNSTILE_SECRET_KEY: Joi.string().optional().allow(''),
  TURNSTILE_VERIFY_URL: Joi.string().uri().optional(),
  TURNSTILE_TIMEOUT_MS: Joi.number().integer().min(500).max(30_000).optional(),
};
