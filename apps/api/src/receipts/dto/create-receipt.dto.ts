import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

import { ReceiptInvoiceInputDto } from './receipt-invoice-input.dto';
import { TransactionDetailsDto } from './transaction-details.dto';

export class CreateReceiptDto {
  @ApiPropertyOptional({ example: 'Payment for goods purchased' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ example: '98765' })
  @IsOptional()
  @IsString()
  manualReceiptNumber?: string;

  @ApiProperty({ example: 1150 })
  @IsNumber()
  @Min(0)
  collectedAmount!: number;

  @ApiPropertyOptional({ example: 'ETB' })
  @IsOptional()
  @IsString()
  receiptCurrency?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  exchangeRate?: number | null;

  @ApiProperty({ type: [ReceiptInvoiceInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiptInvoiceInputDto)
  invoices!: ReceiptInvoiceInputDto[];

  @ApiProperty({ type: TransactionDetailsDto })
  @ValidateNested()
  @Type(() => TransactionDetailsDto)
  transactionDetails!: TransactionDetailsDto;
}
