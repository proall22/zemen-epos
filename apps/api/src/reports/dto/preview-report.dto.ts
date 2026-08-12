import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportBranchScope, ReportSection } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class PreviewReportDto {
  @ApiProperty({ example: '2026-07-19T00:00:00.000Z' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-07-19T23:59:59.999Z' })
  @IsDateString()
  to!: string;

  @ApiProperty({ enum: ReportSection, isArray: true, example: ['SALES', 'INVENTORY'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(ReportSection, { each: true })
  sections!: ReportSection[];

  @ApiPropertyOptional({ enum: ReportBranchScope, default: 'MERCHANT_WIDE' })
  @IsOptional()
  @IsEnum(ReportBranchScope)
  branchScope?: ReportBranchScope;

  @ApiPropertyOptional()
  @ValidateIf((o: PreviewReportDto) => o.branchScope === 'SINGLE_BRANCH')
  @IsString()
  @IsNotEmpty()
  branchId?: string;
}
