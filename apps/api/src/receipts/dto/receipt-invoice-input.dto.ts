import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class ReceiptInvoiceInputDto {
  @ApiProperty({ example: 'cm4abc123', description: 'Local invoice id' })
  @IsString()
  invoiceId!: string;

  @ApiProperty({ enum: ['FULL', 'PARTIAL'], example: 'FULL' })
  @IsIn(['FULL', 'PARTIAL'])
  paymentCoverage!: 'FULL' | 'PARTIAL';

  @ApiProperty({ example: 1150 })
  @IsNumber()
  @Min(0)
  invoicePaidAmount!: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  remainingAmount?: number | null;

  @ApiProperty({ example: 1150 })
  @IsNumber()
  @Min(0)
  totalAmount!: number;
}
