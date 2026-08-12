import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

/** Onboarding payload for a brand-new merchant. Only legalName + TIN are
 *  required; the rest fill in over time and can be edited via PATCH. */
export class CreateMerchantDto {
  @ApiProperty({ example: 'Digicom PLC' })
  @IsString()
  @MaxLength(200)
  legalName!: string;

  @ApiPropertyOptional({ example: 'Digicom' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tradeName?: string;

  @ApiProperty({ example: '0000123456' })
  @IsString()
  @MaxLength(50)
  tin!: string;

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
}
