import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateHarmonizationCodeDto {
  @ApiProperty({ example: '2203.00.00' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code!: string;

  @ApiPropertyOptional({ example: 'Beer made from malt' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({
    example: 40,
    description: 'Ad-valorem excise as a percentage. 0 when the code is purely for classification.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  exciseRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
