import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

import { DEFAULT_TAX_CODE, TAX_CODES } from '../tax-codes';

export class CreateInventoryItemDto {
  @ApiProperty({ example: 'ITM-001' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiPropertyOptional({ example: 'SKU-IPH15P-128' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({
    example: '5449000000996',
    description:
      'UPC/EAN/GTIN barcode printed on the physical package. Enables barcode-scan sale flow.',
  })
  @IsOptional()
  @IsString()
  upc?: string;

  @ApiProperty({ example: 'iPhone 15 Pro', description: 'Short product title' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiPropertyOptional({ description: 'Longer marketing description' })
  @IsOptional()
  @IsString()
  longDescription?: string;

  @ApiPropertyOptional({ description: 'URL to product image' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Merchant inventory category id' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'PCS' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty({ example: 65000 })
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @ApiPropertyOptional({ enum: TAX_CODES, default: DEFAULT_TAX_CODE })
  @IsOptional()
  @IsIn(TAX_CODES)
  taxCode?: string;

  @ApiPropertyOptional({ enum: ['goods', 'service'], default: 'goods' })
  @IsOptional()
  @IsIn(['goods', 'service'])
  nature?: 'goods' | 'service';

  @ApiPropertyOptional({
    example: '1012100',
    description:
      'MoR Harmonized-System code. Set on items that carry an excise value ' +
      'at sale time — the register call refuses ExciseTaxValue > 0 without it.',
  })
  @IsOptional()
  @IsString()
  harmonizationCode?: string;

  @ApiPropertyOptional({
    example: 5,
    description:
      'Ad-valorem excise rate, percent of unit price. Line excise on ' +
      'register is qty * unitPrice * rate / 100. Requires harmonizationCode.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  exciseRate?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Enable on-hand stock tracking' })
  @IsOptional()
  @IsBoolean()
  trackStock?: boolean;

  @ApiPropertyOptional({ description: 'Initial on-hand quantity when tracked' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  stockQuantity?: number;

  @ApiPropertyOptional({
    description:
      'Cost per unit of the opening stock. Required when opening on-hand is greater than zero; never inferred from the selling price.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  openingUnitCost?: number;

  @ApiPropertyOptional({ description: 'Warn when on-hand falls to/below this' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  lowStockThreshold?: number;

  /**
   * Phase F branch scope. Omit / null → merchant-wide catalog item visible
   * from every branch. Set → the item is specific to that branch (its own
   * stock counter; only that branch's cashier sees it). Cashiers can't
   * target other branches — enforced server-side.
   */
  @ApiPropertyOptional({
    description:
      'Branch the item belongs to. Null = merchant-wide. Required for branch-specific items.',
  })
  @IsOptional()
  @IsString()
  branchId?: string | null;
}
