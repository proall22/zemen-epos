import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BranchStockPolicy } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Onboarding payload for a new branch under a merchant. EIRMS credentials
 *  are optional at create — operators may want to provision the branch first
 *  and rotate creds in via PATCH after MOR issues them. */
export class CreateBranchDto {
  @ApiProperty({ example: 'Bole Branch' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    description:
      'POS system number registered with MOR. May be empty at create — set when MOR assigns one.',
  })
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

  @ApiPropertyOptional({
    enum: BranchStockPolicy,
    description:
      'Stock enforcement policy. ALLOW_NEGATIVE (default) or BLOCK_ON_EMPTY.',
  })
  @IsOptional()
  @IsEnum(BranchStockPolicy)
  stockPolicy?: BranchStockPolicy;

  @ApiPropertyOptional({ description: 'EIRMS clientId for this branch.' })
  @IsOptional()
  @IsString()
  eirmsClientId?: string;

  @ApiPropertyOptional({ description: 'EIRMS clientSecret for this branch.' })
  @IsOptional()
  @IsString()
  eirmsClientSecret?: string;

  @ApiPropertyOptional({ description: 'EIRMS apikey for this branch.' })
  @IsOptional()
  @IsString()
  eirmsApikey?: string;

  /** Optional geo-pin (WGS84). Bounded to valid earth coords so we don't
   *  accept a swap or a typo with three zeros too many. */
  @ApiPropertyOptional({ description: 'Latitude (WGS84) of the branch pin.' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ description: 'Longitude (WGS84) of the branch pin.' })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}
