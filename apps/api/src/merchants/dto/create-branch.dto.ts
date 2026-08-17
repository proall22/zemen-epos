import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BranchStockPolicy } from '@prisma/client';
import {
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

/** Onboarding payload for a new branch under a merchant. EIRMS credentials
 *  are optional at create — operators may want to provision the branch first
 *  and rotate creds in via PATCH after MOR issues them. */
export class CreateBranchDto {
  @ApiProperty({ example: 'Bole Branch' })
  @IsString()
  @IsNotEmpty({ message: 'Location name is required.' })
  @MinLength(3, { message: 'Location name must be at least 3 characters.' })
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    description:
      'POS system number registered with MOR. May be empty at create — set when MOR assigns one.',
  })
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
  @MinLength(3)
  @MaxLength(500)
  eirmsClientId?: string;

  @ApiPropertyOptional({ description: 'EIRMS clientSecret for this branch.' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(2000)
  eirmsClientSecret?: string;

  @ApiPropertyOptional({ description: 'EIRMS apikey for this branch.' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(2000)
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
