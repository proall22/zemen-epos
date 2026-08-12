import { Body, Controller, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import type { Response } from 'express';

import { Public } from '../auth/public.decorator';
import type { LoginResponse } from '../auth/auth.types';
import { commitSession } from '../auth/refresh-cookie';
import { RequireTurnstile } from '../security/turnstile/require-turnstile.decorator';
import { SignupMerchantDto } from './dto/signup-merchant.dto';
import { SignupService } from './signup.service';

@ApiTags('Signup')
@Controller('signup')
export class SignupController {
  constructor(private readonly signup: SignupService) {}

  @Public()
  @RequireTurnstile()
  @Post('merchant')
  // 3 signups per hour from any single client. The medium-tier global cap
  // (300 req/min/IP) already bounds traffic; this tighter per-route limit
  // exists because a single signup is much more expensive (transaction +
  // outbound welcome email) and there's no legitimate reason for the same
  // person to submit multiple applications in rapid succession.
  @Throttle({ default: { limit: 3, ttl: seconds(60 * 60) } })
  @ApiOperation({
    summary: 'Self-onboard a new merchant.',
    description:
      'Creates a merchant (pending approval), one initial branch, and a MERCHANT_ADMIN owner user — atomically. Returns a short-lived access JWT in JSON; the long-lived refresh token rides in the `eirms_refresh` HttpOnly cookie. Invoice/receipt creation is blocked until a super-admin approves.',
  })
  async signupMerchant(
    @Body() body: SignupMerchantDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const session = await this.signup.signupMerchant(body);
    return commitSession(session, res);
  }
}
