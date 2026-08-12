import { ApiPropertyOptional } from '@nestjs/swagger';
import { BranchStockPolicy } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Partial-update DTO. Rotating EIRMS credentials goes through this endpoint —
 *  pass any subset of `eirmsClientId/Secret/Apikey`; the next EIRMS call from
 *  this branch will pick them up (the token cache is keyed per-branch and
 *  reloads on expiry / fresh login). */
export class UpdateBranchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
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
  @MaxLength(3)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  eirmsClientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  eirmsClientSecret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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
