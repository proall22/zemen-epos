import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePurchaseItemDto {
  @ApiProperty({ description: 'InventoryItem id (must belong to the branch).' })
  @IsString()
  @IsNotEmpty()
  inventoryItemId!: string;

  @ApiProperty({ description: 'Store receiving the units.' })
  @IsString()
  @IsNotEmpty()
  storeId!: string;

  @ApiProperty({ example: 20 })
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @ApiProperty({
    example: 12.5,
    description: 'Per-unit cost, in the purchase currency (default ETB).',
  })
  @IsNumber()
  @Min(0.0001)
  unitCost!: number;
}

export class CreatePurchaseDto {
  @ApiProperty({ description: 'Branch the goods were received at.' })
  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @ApiPropertyOptional({
    description: 'Vendor id. Null / omitted for one-off cash purchases.',
  })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiPropertyOptional({
    description: 'Vendor invoice / PO / delivery note reference.',
  })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiProperty({
    example: '2026-07-10T09:00:00.000Z',
    description: 'When the delivery was received.',
  })
  @IsDateString()
  purchaseDate!: string;

  @ApiPropertyOptional({ default: 'ETB' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({ type: [CreatePurchaseItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseItemDto)
  items!: CreatePurchaseItemDto[];
}
