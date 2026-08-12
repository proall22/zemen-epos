import { ApiPropertyOptional } from '@nestjs/swagger';
import { AuditDirection } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class QueryAuditDto {
  @ApiPropertyOptional({ enum: AuditDirection })
  @IsOptional()
  @IsEnum(AuditDirection)
  direction?: AuditDirection;

  @ApiPropertyOptional({ description: 'Filter by action (contains)' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ description: 'Filter by actor email (contains)' })
  @IsOptional()
  @IsString()
  actorEmail?: string;

  @ApiPropertyOptional({ description: 'Free-text across action/actor/entity' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  success?: boolean;

  @ApiPropertyOptional({ description: 'ISO date — from (inclusive)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date — to (inclusive)' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ description: 'Filter to one branch id' })
  @IsOptional()
  @IsString()
  branchId?: string;
}
