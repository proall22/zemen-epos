import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * PEM upload body. Two paths:
 *
 * - Standard: only `certPem`. The uploaded leaf is verified against the
 *   private key we generated + stored in Vault at approval time.
 * - BYO (bring-your-own): both `certPem` and `privateKeyPem`. Used when a
 *   merchant already has an INSA-issued cert from before EIRMS. We surface a
 *   "not advised" warning in the UI. The private key + cert are still
 *   verified as a matching pair before we accept them.
 */
export class UploadCertificatePemDto {
  @ApiProperty({
    description:
      'INSA-issued PEM file verbatim (leaf first, chain optional). Must match the private key already in Vault OR the privateKeyPem supplied in the same request.',
  })
  @IsString()
  certPem!: string;

  @ApiPropertyOptional({
    description:
      'Private key PEM (PKCS#8). Only pass this on the BYO path — replaces our generated key. Discouraged; UI shows a warning.',
  })
  @IsOptional()
  @IsString()
  privateKeyPem?: string;
}
