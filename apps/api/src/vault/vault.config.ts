import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export interface VaultConfig {
  /** Base URL of the Vault server, e.g. `http://vault:8200`. */
  address: string;
  /** File the AppRole role_id was written to by vault-init. */
  roleIdFile: string;
  /** File the AppRole secret_id was written to by vault-init. */
  secretIdFile: string;
}

export const vaultConfig = registerAs<VaultConfig>('vault', () => ({
  address: process.env.VAULT_ADDR!,
  roleIdFile: process.env.VAULT_APPROLE_ROLE_ID_FILE!,
  secretIdFile: process.env.VAULT_APPROLE_SECRET_ID_FILE!,
}));

export const vaultValidationSchema = {
  // All three are required — the EIRMS auth path can't function without
  // Vault, so failing fast at boot beats a runtime 503 on the first invoice.
  VAULT_ADDR: Joi.string().uri().required(),
  VAULT_APPROLE_ROLE_ID_FILE: Joi.string().required(),
  VAULT_APPROLE_SECRET_ID_FILE: Joi.string().required(),
};
