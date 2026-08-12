import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportBranchScope, ReportScheduleKind, ReportSection } from '@prisma/client';
import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateScheduledReportDto {
  @ApiProperty({ example: 'Daily sales — Bole branch' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: ReportScheduleKind })
  @IsEnum(ReportScheduleKind)
  scheduleKind!: ReportScheduleKind;

  @ApiPropertyOptional({
    example: 6,
    description:
      'INTERVAL_HOURS only. Anchored to local midnight, so 6 lands at 00/06/12/18 rather than drifting by run duration.',
  })
  @ValidateIf((o: CreateScheduledReportDto) => o.scheduleKind === 'INTERVAL_HOURS')
  @IsInt()
  @Min(1)
  @Max(24)
  intervalHours?: number;

  @ApiPropertyOptional({
    example: 1080,
    description: 'DAILY_AT only. Minutes past local midnight; 1080 = 18:00.',
  })
  @ValidateIf((o: CreateScheduledReportDto) => o.scheduleKind === 'DAILY_AT')
  @IsInt()
  @Min(0)
  @Max(1439)
  dailyAtMinute?: number;

  @ApiPropertyOptional({ default: 'Africa/Addis_Ababa' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ enum: ReportBranchScope, default: 'MERCHANT_WIDE' })
  @IsOptional()
  @IsEnum(ReportBranchScope)
  branchScope?: ReportBranchScope;

  @ApiPropertyOptional({
    description: 'Required when branchScope is SINGLE_BRANCH; rejected otherwise.',
  })
  @ValidateIf((o: CreateScheduledReportDto) => o.branchScope === 'SINGLE_BRANCH')
  @IsString()
  @IsNotEmpty()
  branchId?: string;

  @ApiProperty({ enum: ReportSection, isArray: true, example: ['SALES'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @IsEnum(ReportSection, { each: true })
  sections!: ReportSection[];

  @ApiProperty({
    isArray: true,
    example: ['owner@merchant.et', 'bookkeeper@outside.example'],
    description:
      'Any address, internal or external. Deduped and lowercased before the per-report cap is applied.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  recipients!: string[];

  @ApiPropertyOptional({ default: 'en' })
  @IsOptional()
  @IsIn(['en', 'am'])
  language?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
