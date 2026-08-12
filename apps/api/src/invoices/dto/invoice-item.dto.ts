import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class InvoiceItemDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  LineNumber!: number;

  @ApiProperty({ example: '1111' })
  @IsString()
  ItemCode!: string;

  @ApiProperty({ example: 'Phone' })
  @IsString()
  ProductDescription!: string;

  @ApiProperty({ example: 'Goods' })
  @IsString()
  NatureOfSupplies!: string;

  @ApiProperty({ example: 'PCS' })
  @IsString()
  Unit!: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(0)
  Quantity!: number;

  @ApiProperty({ example: 10000 })
  @IsNumber()
  @Min(0)
  UnitPrice!: number;

  @ApiProperty({ example: 10000, description: 'Quantity * UnitPrice (line subtotal pre-tax)' })
  @IsNumber()
  @Min(0)
  PreTaxValue!: number;

  @ApiProperty({ example: 0 })
  @IsNumber()
  @Min(0)
  Discount!: number;

  @ApiProperty({ example: 0 })
  @IsNumber()
  @Min(0)
  ExciseTaxValue!: number;

  @ApiProperty({ example: 'VAT15' })
  @IsString()
  TaxCode!: string;

  @ApiProperty({ example: 1500 })
  @IsNumber()
  @Min(0)
  TaxAmount!: number;

  @ApiProperty({ example: 11500 })
  @IsNumber()
  @Min(0)
  TotalLineAmount!: number;

  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsString()
  HarmonizationCode?: string | null;

  @ApiPropertyOptional({
    description: 'Local inventory item ID this line was drawn from',
  })
  @IsOptional()
  @IsString()
  inventoryItemId?: string;

  @ApiPropertyOptional({
    description:
      'Memo only: marks a line as changed vs the original. The MoR ItemList ' +
      'for a CRE/DEB carries ONLY the changed lines — each line retaining ' +
      'its original `LineNumber` from the invoice it amends, per MoR — and ' +
      'only the changed lines are persisted/shown locally.',
  })
  @IsOptional()
  @IsBoolean()
  changed?: boolean;
}
