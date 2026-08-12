import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export interface ReportsConfig {
  enabled: boolean;
  dryRun: boolean;
  maxRecipients: number;
  maxPerMerchant: number;
  commitLagMs: number;
  maxAttachmentBytes: number;
  tickMs: number;
  claimBatch: number;
  leaseMinutes: number;
}

export const reportsConfig = registerAs<ReportsConfig>('reports', () => ({
  enabled: process.env.REPORTS_ENABLED === 'true',
  dryRun: process.env.REPORTS_DRY_RUN === 'true',
  maxRecipients: Number(process.env.REPORTS_MAX_RECIPIENTS ?? 20),
  maxPerMerchant: Number(process.env.REPORTS_MAX_PER_MERCHANT ?? 10),
  commitLagMs: Number(process.env.REPORTS_COMMIT_LAG_MS ?? 120_000),
  maxAttachmentBytes: Number(process.env.REPORTS_MAX_ATTACHMENT_BYTES ?? 5_242_880),
  tickMs: Number(process.env.REPORTS_TICK_MS ?? 60_000),
  claimBatch: Number(process.env.REPORTS_CLAIM_BATCH ?? 50),
  leaseMinutes: Number(process.env.REPORTS_LEASE_MINUTES ?? 15),
}));

/** Bounds matter: an unbounded recipient cap turns one report into a mailing
 *  list, and a zero commit lag reintroduces the invisible-gap bug. */
export const reportsValidationSchema = {
  REPORTS_ENABLED: Joi.string().valid('true', 'false').default('false'),
  REPORTS_DRY_RUN: Joi.string().valid('true', 'false').default('false'),
  REPORTS_MAX_RECIPIENTS: Joi.number().integer().min(1).max(100).default(20),
  REPORTS_MAX_PER_MERCHANT: Joi.number().integer().min(1).max(100).default(10),
  REPORTS_COMMIT_LAG_MS: Joi.number()
    .integer()
    .min(0)
    .max(900_000)
    .default(120_000),
  REPORTS_MAX_ATTACHMENT_BYTES: Joi.number()
    .integer()
    .min(1024)
    .max(40_000_000)
    .default(5_242_880),
  REPORTS_TICK_MS: Joi.number()
    .integer()
    .min(10_000)
    .max(600_000)
    .default(60_000),
  REPORTS_CLAIM_BATCH: Joi.number().integer().min(1).max(500).default(50),
  REPORTS_LEASE_MINUTES: Joi.number().integer().min(1).max(120).default(15),
};
