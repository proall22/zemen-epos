import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
  ValidateNested,
} from 'class-validator';

/** Merchant fields a self-signed-up owner provides. Mirrors CreateMerchantDto
 *  but lives in the public signup namespace so future signup-specific tweaks
 *  (e.g. CAPTCHA, T&C acceptance) don't leak back into the admin DTO. */
export class SignupMerchantInfoDto {
  @ApiProperty({ example: 'Acme PLC' })
  @IsString()
  @IsNotEmpty({ message: 'Legal name is required.' })
  @MinLength(3, { message: 'Legal name must be at least 3 characters.' })
  @MaxLength(200)
  legalName!: string;

  @ApiPropertyOptional({ example: 'Acme' })
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
  @Matches(/^\+?[0-9][0-9 ()-]{6,28}$/, {
    message: 'Phone number format is invalid.',
  })
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

/** First branch created alongside the merchant. Name + optional geo-pin;
 *  EIRMS credentials are added later via PATCH /merchants/:id/branches/:bid. */
export class SignupBranchInfoDto {
  @ApiPropertyOptional({
    description: "Name for the first branch. Defaults to 'Main'.",
    example: 'Main',
  })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Branch name must be at least 3 characters.' })
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ description: 'Branch latitude (WGS84).' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ description: 'Branch longitude (WGS84).' })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}

/** The person signing up — becomes the merchant's first ACCOUNTANT (merchant
 *  admin). They can later add cashiers + more branches via the existing
 *  Phase D APIs. */
export class SignupOwnerDto {
  @ApiProperty({ example: 'owner@acme.et' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  // bcrypt truncates at 72 bytes — anything bigger is wasted hashing CPU. Cap
  // at 128 to leave room for long generated passphrases without inviting the
  // multi-MB-password DoS.
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ example: 'Hana Tadesse' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Owner name must be at least 2 characters.' })
  @MaxLength(200)
  name?: string;
}

export class SignupMerchantDto {
  @ApiProperty({ type: SignupMerchantInfoDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SignupMerchantInfoDto)
  merchant!: SignupMerchantInfoDto;

  @ApiPropertyOptional({ type: SignupBranchInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SignupBranchInfoDto)
  branch?: SignupBranchInfoDto;

  @ApiProperty({ type: SignupOwnerDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SignupOwnerDto)
  owner!: SignupOwnerDto;

  @ApiPropertyOptional({
    description:
      'Cloudflare Turnstile token. Required when TURNSTILE_ENABLED=true on the server.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  turnstileToken?: string;
}
