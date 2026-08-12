import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class TransferStockDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fromStoreId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  toStoreId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  inventoryItemId!: string;

  @ApiProperty({ example: 5 })
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Why the transfer — e.g. "restocking front shelf".',
  })
  @IsOptional()
  @IsString()
  note?: string;
}
