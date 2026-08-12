import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';

/**
 * MoR's `PaymentDetails` block. Two independent axes:
 *
 * - `Mode` is the classification MoR accepts on the invoice — one of
 *   CASH / ADVANCE / CREDIT. It is NOT the payment instrument (cheque /
 *   card / transfer / …); the instrument is captured on the receipt via
 *   `TransactionDetails.ModeOfPayment` (see receipts/dto/transaction-details.dto).
 *
 * - `PaymentTerm` is a free-form string per MoR's guide (sample: IMMIDIATE).
 *   We ship a small preset list the UI offers, but the wire type stays
 *   `string` so ops can send a bespoke term without a code change.
 */

export const INVOICE_PAYMENT_MODES = ['CASH', 'ADVANCE', 'CREDIT'] as const;
export type InvoicePaymentMode = (typeof INVOICE_PAYMENT_MODES)[number];

/** Preset payment terms surfaced in the picker. Callers may send any string;
 *  these are just the SPA's suggested options. Note MoR's sample spells it
 *  `IMMIDIATE` — we mirror that spelling so ops-side reports match. */
export const INVOICE_PAYMENT_TERM_PRESETS = [
  'IMMIDIATE',
  'NET_7',
  'NET_15',
  'NET_30',
] as const;

export class PaymentDetailsDto {
  @ApiProperty({
    enum: INVOICE_PAYMENT_MODES,
    example: 'CASH',
    description:
      'MoR classification: CASH (paid at issue), ADVANCE (deposit), CREDIT (paid later).',
  })
  @IsIn(INVOICE_PAYMENT_MODES as unknown as string[])
  Mode!: InvoicePaymentMode;

  @ApiProperty({
    example: 'IMMIDIATE',
    description:
      'Payment term. Free-form per MoR; the SPA suggests IMMIDIATE, NET_7, NET_15, NET_30.',
  })
  @IsString()
  @MaxLength(40)
  PaymentTerm!: string;
}
