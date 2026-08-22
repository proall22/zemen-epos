import { TaxCodeType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateTaxCodeDto {
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,19}$/)
  code!: string;

  @IsString()
  name!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  rate!: number;

  @IsEnum(TaxCodeType)
  type!: TaxCodeType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateTaxCodeDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  rate?: number;
  @IsOptional() @IsEnum(TaxCodeType) type?: TaxCodeType;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateSystemRuleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) value?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CalculateWithholdingDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  preTaxAmount!: number;

  @IsIn(['goods', 'service'])
  nature!: 'goods' | 'service';
}
