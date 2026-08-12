import { ApiProperty } from '@nestjs/swagger';
import { ConsentScope } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsString,
} from 'class-validator';

import { ALLOWED_CONSENT_MINUTES } from '../consent.constants';

const SCOPES = Object.values(ConsentScope);

export class RequestConsentDto {
  @ApiProperty({ example: 'clv0merchant123' })
  @IsString()
  merchantId!: string;

  @ApiProperty({
    enum: ConsentScope,
    isArray: true,
    example: ['DASHBOARD', 'INVOICES'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(SCOPES, { each: true })
  scopes!: ConsentScope[];

  @ApiProperty({
    description: 'Requested access window in minutes (max 24h).',
    example: 60,
    enum: ALLOWED_CONSENT_MINUTES as unknown as number[],
  })
  @IsInt()
  @IsIn(ALLOWED_CONSENT_MINUTES as unknown as number[])
  proposedMinutes!: number;
}
