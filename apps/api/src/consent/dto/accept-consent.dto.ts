import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt } from 'class-validator';

import { ALLOWED_CONSENT_MINUTES } from '../consent.constants';

export class AcceptConsentDto {
  @ApiProperty({
    description:
      'Access window the merchant admin grants, in minutes. Must be one of the allowed values and no longer than the super-admin requested.',
    example: 30,
    enum: ALLOWED_CONSENT_MINUTES as unknown as number[],
  })
  @IsInt()
  @IsIn(ALLOWED_CONSENT_MINUTES as unknown as number[])
  grantedMinutes!: number;
}
