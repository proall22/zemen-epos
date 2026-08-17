import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Onboarding payload for a brand-new merchant. Only legalName + TIN are
 *  required; the rest fill in over time and can be edited via PATCH. */
export class CreateMerchantDto {
  @ApiProperty({ example: 'Digicom PLC' })
  @IsString()
  @IsNotEmpty({ message: 'Legal name is required.' })
  @MinLength(3, { message: 'Legal name must be at least 3 characters.' })
  @MaxLength(200)
  legalName!: string;

  @ApiPropertyOptional({ example: 'Digicom' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tradeName?: string;

  @ApiProperty({ example: '0000123456' })
  @IsString()
  @Matches(/^\d{10}$/, { message: 'TIN must contain exactly 10 digits.' })
  tin!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(/^\+?[0-9][0-9 ()-]{6,28}$/, { message: 'Phone number format is invalid.' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  vatNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  zone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  wereda?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  kebele?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  houseNumber?: string;
}
