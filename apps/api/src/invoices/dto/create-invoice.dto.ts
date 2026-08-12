import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { BuyerDetailsDto } from './buyer-details.dto';
import { DocumentDetailsDto } from './document-details.dto';
import { InvoiceItemDto } from './invoice-item.dto';
import { PaymentDetailsDto } from './payment-details.dto';
import { ReferenceDetailsDto } from './reference-details.dto';
import { SellerOverridesDto } from './seller-overrides.dto';
import { SourceSystemInputDto } from './source-system.dto';
import { ValueDetailsDto } from './value-details.dto';

export type TransactionType = 'B2B' | 'B2C' | 'B2G';

export class CreateInvoiceDto {
  @ApiProperty({ enum: ['B2B', 'B2C', 'B2G'], example: 'B2B' })
  @IsIn(['B2B', 'B2C', 'B2G'])
  TransactionType!: TransactionType;

  @ApiProperty({ type: BuyerDetailsDto })
  @ValidateNested()
  @Type(() => BuyerDetailsDto)
  BuyerDetails!: BuyerDetailsDto;

  @ApiProperty({ type: DocumentDetailsDto })
  @ValidateNested()
  @Type(() => DocumentDetailsDto)
  DocumentDetails!: DocumentDetailsDto;

  @ApiProperty({ type: [InvoiceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  ItemList!: InvoiceItemDto[];

  @ApiProperty({ type: PaymentDetailsDto })
  @ValidateNested()
  @Type(() => PaymentDetailsDto)
  PaymentDetails!: PaymentDetailsDto;

  @ApiProperty({ type: ValueDetailsDto })
  @ValidateNested()
  @Type(() => ValueDetailsDto)
  ValueDetails!: ValueDetailsDto;

  @ApiProperty({ type: SourceSystemInputDto })
  @ValidateNested()
  @Type(() => SourceSystemInputDto)
  SourceSystem!: SourceSystemInputDto;

  @ApiPropertyOptional({ type: ReferenceDetailsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReferenceDetailsDto)
  ReferenceDetails?: ReferenceDetailsDto;

  @ApiPropertyOptional({ type: SellerOverridesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SellerOverridesDto)
  SellerOverrides?: SellerOverridesDto;

  /**
   * Phase F — branch the sale is recorded against. Cashiers have an implicit
   * branch (from their JWT) and may omit this; for ACCOUNTANT/SUPPORT
   * (merchant-wide) it's required so the invoice is attributed to a specific
   * branch (driving its MOR sequence + on-hand stock).
   */
  @ApiPropertyOptional({
    description:
      'Branch the sale is recorded against. Required for users without a pinned branch.',
  })
  @IsOptional()
  @IsString()
  branchId?: string;

  /**
   * Optional POS cart-session id. When supplied, the reservations held by
   * this session are released atomically as part of the sale — that way
   * `assertStockPolicy` and the sale itself agree on what's reserved vs.
   * available.
   */
  @ApiPropertyOptional({
    description:
      'POS cart-session id. When set, the sale releases every reservation on this session in the same transaction as the stock decrement.',
  })
  @IsOptional()
  @IsString()
  cartSessionId?: string;
}
