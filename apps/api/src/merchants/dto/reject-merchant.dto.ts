import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Reason a back-office reviewer is rejecting a pending merchant signup.
 * Optional — when present, it's stored on the merchant row and rendered into
 * the rejection email so the owner sees concrete next steps. Keep it short:
 * the email shows it inline, and we don't want operators pasting paragraphs.
 */
export class RejectMerchantDto {
  @ApiPropertyOptional({
    description:
      'Short, customer-readable reason for the rejection (e.g. "TIN does not match Ministry records"). Optional.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
