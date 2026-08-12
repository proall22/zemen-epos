import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

// Settlement classification MOR's `TransactionDetails.ModeOfPayment` accepts.
export const PAYMENT_CLASSIFICATIONS = ['CASH', 'ADVANCE', 'CREDIT'] as const;
export type PaymentClassification = (typeof PAYMENT_CLASSIFICATIONS)[number];

// Payment instrument captured locally; drives which detail fields apply and is
// kept in our records. NOT MOR's ModeOfPayment (which only takes the
// classification above).
export const PAYMENT_MODES = [
  'CASH',
  'CHEQUE',
  'CPO',
  'SWIFT',
  'CARD',
  'WIRE',
  'BANK_TRANSFER',
  'LETTER_OF_CREDIT',
] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export class TransactionDetailsDto {
  @ApiProperty({ enum: PAYMENT_CLASSIFICATIONS, example: 'CASH' })
  @IsIn(PAYMENT_CLASSIFICATIONS as unknown as string[])
  paymentMode!: PaymentClassification;

  @ApiProperty({ enum: PAYMENT_MODES, example: 'CASH' })
  @IsIn(PAYMENT_MODES as unknown as string[])
  modeOfPayment!: PaymentMode;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  collectorName!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() paymentServiceProvider?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() otherPaymentServiceProviderName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chequeNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cpoNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() documentNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accountNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() transactionNumber?: string;
}
