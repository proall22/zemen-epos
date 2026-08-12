import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export interface ExportsConfig {
  storageDir: string;
  retentionDays: number;
}

export const exportsConfig = registerAs<ExportsConfig>('exports', () => ({
  storageDir: process.env.EXPORTS_STORAGE_DIR ?? '/var/lib/eirms/exports',
  retentionDays: Number(process.env.EXPORTS_RETENTION_DAYS ?? 7),
}));

export const exportsValidationSchema = {
  EXPORTS_STORAGE_DIR: Joi.string().default('/var/lib/eirms/exports'),
  EXPORTS_RETENTION_DAYS: Joi.number().integer().min(1).max(90).default(7),
};
