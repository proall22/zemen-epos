import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import type { Branch, Merchant } from '@prisma/client';
import type { Request, Response } from 'express';

import { SkipBranchContext } from '../audit/skip-branch-context.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RequireTurnstile } from '../security/turnstile/require-turnstile.decorator';
import { VaultService } from '../vault/vault.service';
import { AuthService } from './auth.service';
import type {
  AuthUser,
  JwtPayload,
  LoginResponse,
} from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { PasswordResetService } from './password-reset.service';
import { Public } from './public.decorator';
import {
  REFRESH_COOKIE_NAME,
  commitSession,
  refreshCookieOptions,
} from './refresh-cookie';

type SafeBranchLite = Omit<
  Branch,
  'eirmsClientId' | 'eirmsClientSecret' | 'eirmsApikey'
>;

/**
 * A branch the caller may act as, with the operational-readiness bits the
 * switcher needs to badge cards. `hasCreds` = clientId/clientSecret/apikey
 * are populated in Vault; `hasCert` = signing key + INSA cert are uploaded.
 * A branch that's missing either can be picked in the switcher but the
 * write-side endpoints will still refuse until the wizard is completed.
 */
interface AvailableBranch extends SafeBranchLite {
  hasCreds: boolean;
  hasCert: boolean;
}

/** Full bootstrap context. `activeBranch` reflects the picked/pinned branch
 *  after the interceptor validates the caller's access; the switcher renders
 *  `availableBranches` and swaps the header to change it. */
interface MeContext {
  user: AuthUser;
  merchant: Merchant | null;
  activeBranch: SafeBranchLite | null;
  availableBranches: AvailableBranch[];
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly passwordReset: PasswordResetService,
    private readonly vault: VaultService,
  ) {}

  @Public()
  @RequireTurnstile()
  @Post('login')
  // 5 attempts per 5 minutes from any single client. Account-level lockout
  // (5 fails per email -> 15 min lock) lives in AuthService.login so it
  // catches distributed-IP attacks too. Both layers are intentional.
  @Throttle({ default: { limit: 5, ttl: seconds(300) } })
  @ApiOperation({ summary: 'Email + password sign in' })
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const session = await this.auth.login(body);
    return commitSession(session, res);
  }

  @Public()
  @Post('refresh')
  // The refresh endpoint can be called repeatedly when a busy SPA bursts a
  // bunch of requests just after access-token expiry — cap at 30/min/IP to
  // bound damage from a token-spraying script without affecting legitimate
  // SPAs.
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ApiOperation({
    summary:
      'Exchange the HttpOnly refresh cookie for a fresh access token (rotates).',
    description:
      'Reads the refresh token from the `eirms_refresh` HttpOnly cookie set at login. Returns a new access JWT (5 min) in JSON and rotates the cookie with a new refresh token (30 d). Presenting an already-revoked-but-not-expired refresh token is treated as compromise and invalidates every session for that user.',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!raw) throw new UnauthorizedException('No active session.');
    const session = await this.auth.refresh(raw);
    return commitSession(session, res);
  }

  @Public()
  @RequireTurnstile()
  @Post('forgot-password')
  // 5 requests / hour / IP is well above any legitimate "I keep mistyping my
  // email" rate, but bounds enumeration probes. Per-email rate limiting
  // happens inside the service (existing pattern: voids prior tokens).
  @Throttle({ default: { limit: 5, ttl: seconds(3600) } })
  @ApiOperation({
    summary: 'Request a password reset email.',
    description:
      'Always returns 200 — never reveals whether the email matches a user. Sends a reset link to the email when it does match an active account.',
  })
  async forgotPassword(
    @Body() body: ForgotPasswordDto,
  ): Promise<{ ok: true }> {
    await this.passwordReset.request(body.email);
    return { ok: true };
  }

  @Public()
  @Post('reset-password')
  @Throttle({ default: { limit: 10, ttl: seconds(3600) } })
  @ApiOperation({
    summary: 'Consume a password-reset token to set a new password.',
    description:
      'Voids all of the user\'s refresh tokens on success — every device has to sign in again.',
  })
  async resetPassword(@Body() body: ResetPasswordDto): Promise<{ ok: true }> {
    await this.passwordReset.reset(body.token, body.password);
    return { ok: true };
  }

  @Public()
  @Post('logout')
  @ApiOperation({
    summary: 'Revoke the current refresh cookie.',
    description:
      'Reads the refresh token from the `eirms_refresh` cookie and revokes it. Idempotent. Never reveals whether the token was valid. Revoking every session for a user is an admin action.',
  })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    await this.auth.logout(raw);
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions(false));
    return { ok: true };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the currently signed-in user' })
  me(@CurrentUser() user: JwtPayload): Promise<AuthUser> {
    return this.auth.me(user);
  }

  @Patch('me/preferences')
  @ApiOperation({
    summary: 'Update self-service preferences (currently just UI language).',
  })
  updatePreferences(
    @CurrentUser() user: JwtPayload,
    @Body() body: UpdatePreferencesDto,
  ): Promise<AuthUser> {
    return this.auth.updateLanguage(user.sub, body.language);
  }

  @Get('me/context')
  @SkipBranchContext()
  @ApiOperation({
    summary:
      'Full bootstrap context: user + their merchant + their branch.',
    description:
      "Used by the SPA at boot to render the shell, PDFs, and POS receipts with the caller's seller details.",
  })
  async meContext(@CurrentUser() payload: JwtPayload): Promise<MeContext> {
    const user = await this.auth.me(payload);
    const merchant = user.merchantId
      ? await this.prisma.merchant.findUnique({
          where: { id: user.merchantId },
        })
      : null;

    // Available-branch resolution mirrors the interceptor:
    //   SUPER_ADMIN / no merchant → none.
    //   MERCHANT_ADMIN            → every branch under the merchant.
    //   others                    → pinned user.branchId ∪ UserBranch rows.
    let availableBranches: AvailableBranch[] = [];
    if (user.merchantId) {
      const rows =
        user.role === 'MERCHANT_ADMIN'
          ? await this.prisma.branch.findMany({
              where: { merchantId: user.merchantId, active: true },
              orderBy: [{ active: 'desc' }, { name: 'asc' }],
              omit: {
                eirmsClientId: true,
                eirmsClientSecret: true,
                eirmsApikey: true,
              },
            })
          : await this.prisma.branch.findMany({
              where: {
                merchantId: user.merchantId,
                active: true,
                OR: [
                  { id: user.branchId ?? '__none__' },
                  { branchAccess: { some: { userId: user.id } } },
                ],
              },
              orderBy: [{ active: 'desc' }, { name: 'asc' }],
              omit: {
                eirmsClientId: true,
                eirmsClientSecret: true,
                eirmsApikey: true,
              },
            });
      availableBranches = await Promise.all(
        rows.map(async (b) => {
          const [creds, signing] = await Promise.all([
            this.vault.getBranchCredFlags(user.merchantId!, b.id),
            this.vault.getBranchSigningFlags(user.merchantId!, b.id),
          ]);
          return {
            ...b,
            hasCreds:
              creds.clientId && creds.clientSecret && creds.apikey,
            hasCert: signing.privateKey && signing.cert,
          };
        }),
      );
    }

    // activeBranch = the pinned default when it's still available. Otherwise
    // prefer a branch that can actually invoice — falling back to the
    // alphabetically-first one lands the user on a half-onboarded branch and
    // blocks them at the till for no visible reason.
    const pinned =
      availableBranches.find((b) => b.id === user.branchId) ?? null;
    const firstReady =
      availableBranches.find((b) => b.hasCreds && b.hasCert) ?? null;
    const activeBranch =
      pinned ?? firstReady ?? availableBranches[0] ?? null;

    return { user, merchant, activeBranch, availableBranches };
  }

}
