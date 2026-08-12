import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';

/**
 * Caller-provided portion of SourceSystem. SystemNumber and SystemType are
 * filled in by EirmsInvoiceService from the cached JWT claims.
 */
export class SourceSystemInputDto {
  @ApiProperty({ example: 'AAA' })
  @IsString()
  CashierName!: string;

  @ApiProperty({ example: 'AAA' })
  @IsString()
  SalesPersonName!: string;

  @ApiProperty({ example: 1, description: 'Per-cashier sequential counter' })
  @IsInt()
  @Min(0)
  InvoiceCounter!: number;
}
