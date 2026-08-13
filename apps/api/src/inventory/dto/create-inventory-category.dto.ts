import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateInventoryCategoryDto {
  @ApiProperty({ example: 'Beverages' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: 'Hot and cold drinks' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
