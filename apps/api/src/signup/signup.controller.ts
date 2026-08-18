import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Response } from 'express';

import { AuthService } from '../auth/auth.service';
import { GoogleOAuthService } from '../auth/google-oauth.service';
import { Public } from '../auth/public.decorator';
import { commitSession } from '../auth/refresh-cookie';
import type { LoginResponse, PendingAuthResponse } from '../auth/auth.types';
import { RequireTurnstile } from '../security/turnstile/require-turnstile.decorator';
import { SignupMerchantDto } from './dto/signup-merchant.dto';
import { SignupService } from './signup.service';

@ApiTags('Signup')
@Controller('signup')
export class SignupController {
  constructor(
    private readonly signup: SignupService,
    private readonly googleOAuth: GoogleOAuthService,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @RequireTurnstile()
  @Post('merchant')
  // 3 signups per hour from any single client. The medium-tier global cap
  // (300 req/min/IP) already bounds traffic; this tighter per-route limit
  // exists because a single signup is much more expensive (transaction +
  // outbound welcome email) and there's no legitimate reason for the same
  // person to submit multiple applications in rapid succession.
  @Throttle({ default: { limit: 3, ttl: seconds(60 * 60) } })
  @UseInterceptors(
    FileInterceptor('legalDocument', {
      limits: { fileSize: 20 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiOperation({
    summary: 'Self-onboard a new merchant.',
    description:
      'Creates a merchant (pending approval), one initial branch, and a MERCHANT_ADMIN owner user — atomically. Returns a short-lived access JWT in JSON; the long-lived refresh token rides in the `eirms_refresh` HttpOnly cookie. Invoice/receipt creation is blocked until a super-admin approves.',
  })
  async signupMerchant(
    @Body('payload') payload: string,
    @UploadedFile()
    legalDocument?: {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
      size: number;
    },
  ): Promise<PendingAuthResponse> {
    if (!legalDocument)
      throw new BadRequestException('A legal document is required.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new BadRequestException('Signup details are malformed.');
    }
    const body = plainToInstance(SignupMerchantDto, parsed);
    const errors = await validate(body, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length) throw new BadRequestException(errors);
    return this.signup.signupMerchant(body, legalDocument);
  }

  @Public()
  @Post('google/merchant')
  @Throttle({ default: { limit: 3, ttl: seconds(60 * 60) } })
  @UseInterceptors(
    FileInterceptor('legalDocument', {
      limits: { fileSize: 20 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiOperation({
    summary: 'Complete a Google-authenticated merchant registration.',
  })
  async signupMerchantWithGoogle(
    @Body('payload') payload: string,
    @UploadedFile()
    legalDocument:
      | {
          buffer: Buffer;
          mimetype: string;
          originalname: string;
          size: number;
        }
      | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    if (!legalDocument)
      throw new BadRequestException('A legal document is required.');
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Signup details are malformed.');
    }
    const googleToken =
      typeof parsed.googleToken === 'string' ? parsed.googleToken : '';
    const identity = this.googleOAuth.verifyEnrollmentToken(googleToken);
    const body = plainToInstance(SignupMerchantDto, {
      merchant: parsed.merchant,
      branch: parsed.branch,
      owner: {
        email: identity.email,
        name: identity.name ?? undefined,
        password: 'Google-managed-password-placeholder',
      },
    });
    const errors = await validate(body, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length) throw new BadRequestException(errors);
    const user = await this.signup.signupMerchantWithGoogle(
      body,
      legalDocument,
      identity,
    );
    return commitSession(await this.auth.issueSession(user), res);
  }
}
