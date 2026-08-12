import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Optional seller fields the caller can override. SellerDetails.Tin is always
 * stamped from the system identity (never trusted from the client).
 */
export class SellerOverridesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  LegalName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  Email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  Phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  City?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  HouseNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  Region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  SubCity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  Locality?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  Wereda?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  VatNumber?: string;
}
