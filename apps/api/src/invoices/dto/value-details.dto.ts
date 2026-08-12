import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ValueDetailsDto {
  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsNumber()
  Discount?: number | null;

  @ApiProperty({ example: 0 })
  @IsNumber()
  @Min(0)
  ExciseValue!: number;

  @ApiProperty({ example: 1650 })
  @IsNumber()
  @Min(0)
  TaxValue!: number;

  @ApiProperty({ example: 220 })
  @IsNumber()
  @Min(0)
  IncomeWithholdValue!: number;

  @ApiProperty({ example: 0 })
  @IsNumber()
  @Min(0)
  TransactionWithholdValue!: number;

  @ApiProperty({ example: 12650 })
  @IsNumber()
  @Min(0)
  TotalValue!: number;

  @ApiProperty({ example: 'ETB' })
  @IsString()
  InvoiceCurrency!: string;
}
