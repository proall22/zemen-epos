import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ReferenceDetailsDto {
  @ApiPropertyOptional({ example: '' })
  @IsOptional()
  @IsString()
  PreviousIrn?: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  @IsOptional()
  @IsString()
  RelatedDocument?: string | null;
}
