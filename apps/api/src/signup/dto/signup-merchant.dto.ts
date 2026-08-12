import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Merchant fields a self-signed-up owner provides. Mirrors CreateMerchantDto
 *  but lives in the public signup namespace so future signup-specific tweaks
 *  (e.g. CAPTCHA, T&C acceptance) don't leak back into the admin DTO. */
export class SignupMerchantInfoDto {
  @ApiProperty({ example: 'Acme PLC' })
  @IsString()
  @MaxLength(200)
  legalName!: string;

  @ApiPropertyOptional({ example: 'Acme' })
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

/** First branch created alongside the merchant. Name + optional geo-pin;
 *  EIRMS credentials are added later via PATCH /merchants/:id/branches/:bid. */
export class SignupBranchInfoDto {
  @ApiPropertyOptional({
    description: "Name for the first branch. Defaults to 'Main'.",
    example: 'Main',
  })
  @IsOptional()
  @IsString()
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
