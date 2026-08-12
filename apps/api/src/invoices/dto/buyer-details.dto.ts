import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class BuyerDetailsDto {
  @ApiPropertyOptional({
    example: '0999930000',
    description: 'Buyer TIN. Omit for walk-in / B2C customers.',
  })
  @IsOptional()
  @IsString()
  Tin?: string;

  @ApiProperty({ example: 'ABC Trading' })
  @IsString()
  LegalName!: string;

  @ApiPropertyOptional({ example: 'Addis Ababa' })
  @IsOptional()
  @IsString()
  City?: string;

  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsOptional()
  @IsString()
  Email?: string;

  @ApiPropertyOptional({ example: '0912345678' })
  @IsOptional()
  @IsString()
  Phone?: string;

  @ApiPropertyOptional({ example: 'NEW' })
  @IsOptional()
  @IsString()
  HouseNumber?: string;

  @ApiPropertyOptional({ example: 'KID', description: 'KID, PASS, etc.' })
  @IsOptional()
  @IsString()
  IdType?: string;

  @ApiPropertyOptional({ example: '11122222222222222' })
  @IsOptional()
  @IsString()
  IdNumber?: string;

  @ApiPropertyOptional({ example: '13' })
  @IsOptional()
  @IsString()
  Region?: string;

  @ApiPropertyOptional({ example: '70' })
  @IsOptional()
  @IsString()
  Country?: string;

  @ApiPropertyOptional({ example: 'SHA' })
  @IsOptional()
  @IsString()
  Zone?: string;

  @ApiPropertyOptional({ example: '03' })
  @IsOptional()
  @IsString()
  Kebele?: string;

  @ApiPropertyOptional({ example: '574' })
  @IsOptional()
  @IsString()
  Wereda?: string;

  @ApiPropertyOptional({ example: '123475885858' })
  @IsOptional()
  @IsString()
  VatNumber?: string;
}
