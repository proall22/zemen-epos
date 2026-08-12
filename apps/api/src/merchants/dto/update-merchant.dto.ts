import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** All fields optional — partial update. `active=false` soft-disables the
 *  merchant (records are kept; new sales for the tenant get refused). */
export class UpdateMerchantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tradeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vatNumber?: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    enum: ['en', 'am'],
    description:
      'Merchant-wide fallback language for buyer notifications when the buyer has no language set.',
  })
  @IsOptional()
  @IsString()
  @IsIn(['en', 'am'])
  defaultLanguage?: string;
}
