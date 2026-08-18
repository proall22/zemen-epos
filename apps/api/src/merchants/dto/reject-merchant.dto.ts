import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Reason a back-office reviewer is rejecting a pending merchant signup.
 * Required — it is stored on the merchant row and rendered into
 * the rejection email so the owner sees concrete next steps. Keep it short:
 * the email shows it inline, and we don't want operators pasting paragraphs.
 */
export class RejectMerchantDto {
  @ApiProperty({
    description:
      'Short, customer-readable reason for the rejection (e.g. "The registration document is incomplete").',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
