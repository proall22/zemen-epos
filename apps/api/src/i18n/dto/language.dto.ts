import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateLanguageDto {
  @ApiProperty({
    example: 'or',
    description: 'BCP-47 short code (2–5 chars, lowercase / hyphen).',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5)
  @Matches(/^[a-z]{2,3}(-[A-Z]{2})?$/, {
    message: 'code must be a BCP-47 short language tag (e.g. "or", "am-ET")',
  })
  code!: string;

  @ApiProperty({ example: 'Oromo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @ApiProperty({ example: 'Afaan Oromoo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nativeName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Display order in the switcher (lower = first).' })
  @IsOptional()
  @IsInt()
  ordering?: number;
}

export class UpdateLanguageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  nativeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  ordering?: number;
}
