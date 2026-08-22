import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export const WITHHOLD_TYPES = ['TWTH', 'IWTH'] as const;
export type WithholdType = (typeof WITHHOLD_TYPES)[number];

export class WithholdInvoiceDetailDto {
  @ApiProperty({
    example:
      'test-ad6205eb149f59564508f3cee0a5ef26a1b1ff872d02a3283dab51a552788875',
    description: "External seller invoice IRN we're withholding against",
  })
  @IsString()
  invoiceIrn!: string;

  @ApiPropertyOptional({ example: 'ETB' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  exchangeRate?: number | null;
}

export class WithholdDetailDto {
  @ApiProperty({ enum: WITHHOLD_TYPES, example: 'TWTH' })
  @IsIn(WITHHOLD_TYPES)
  type!: WithholdType;

  @ApiPropertyOptional({ enum: ['goods', 'service'], example: 'goods' })
  @IsOptional()
  @IsIn(['goods', 'service'])
  nature?: 'goods' | 'service';

  @ApiPropertyOptional({
    example: 3,
    description:
      'Withholding rate as percent. Defaults to 3 (Ethiopian standard).',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  rate?: number | null;

  @ApiProperty({ example: 40000 })
  @IsNumber()
  @Min(0)
  preTaxAmount!: number;

  @ApiProperty({ example: 1200 })
  @IsNumber()
  @Min(0)
  withholdingAmount!: number;
}

export class WithholdSupplierDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subTin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vatNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  zone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  wereda?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  kebele?: string;
}

export class CreateWithholdReceiptDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ type: WithholdInvoiceDetailDto })
  @ValidateNested()
  @Type(() => WithholdInvoiceDetailDto)
  invoiceDetail!: WithholdInvoiceDetailDto;

  @ApiProperty({ type: WithholdDetailDto })
  @ValidateNested()
  @Type(() => WithholdDetailDto)
  withholdDetail!: WithholdDetailDto;

  @ApiPropertyOptional({
    type: WithholdSupplierDto,
    description:
      "Supplier identity captured at withhold issue-time — the source invoice isn't in our DB, so the cashier fills these in on the form. Optional so old integrations keep working.",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => WithholdSupplierDto)
  supplier?: WithholdSupplierDto;
}
