import { ApiPropertyOptional } from '@nestjs/swagger';
import { BranchStockPolicy } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
} from 'class-validator';

/** Partial-update DTO. Rotating EIRMS credentials goes through this endpoint —
 *  pass any subset of `eirmsClientId/Secret/Apikey`; the next EIRMS call from
 *  this branch will pick them up (the token cache is keyed per-branch and
 *  reloads on expiry / fresh login). */
export class UpdateBranchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Location name cannot be empty.' })
  @MinLength(3, { message: 'Location name must be at least 3 characters.' })
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^$|^[A-Za-z0-9][A-Za-z0-9._/-]*$/, {
    message: 'System number may contain letters, numbers, dot, slash, dash, or underscore.',
  })
  systemNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  zone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  wereda?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  kebele?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  houseNumber?: string;

  @ApiPropertyOptional({
    description:
      'Branch sub-TIN (MoR per-establishment tax id). Populated in the DOCX certificate request form.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  subTin?: string;

  @ApiPropertyOptional({
    description:
      'Name this establishment trades under. May differ from the merchant trade name.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tradeName?: string;

  @ApiPropertyOptional({ description: 'Branch VAT registration number.' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  vatNumber?: string;

  @ApiPropertyOptional({
    description: 'ISO country code. Defaults to ET when unset.',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(3)
  @Matches(/^[A-Z]{2,3}$/, { message: 'Country must be a 2 or 3 letter uppercase code, for example ET.' })
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  eirmsClientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(2000)
  eirmsClientSecret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(2000)
  eirmsApikey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    enum: BranchStockPolicy,
    description:
      'ALLOW_NEGATIVE = sales proceed on empty stock (default). BLOCK_ON_EMPTY = tracked items with 0 on-hand cannot be sold at this branch.',
  })
  @IsOptional()
  @IsEnum(BranchStockPolicy)
  stockPolicy?: BranchStockPolicy;

  /** Geo-pin update. Pass null to clear; omit to keep current. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;
}
