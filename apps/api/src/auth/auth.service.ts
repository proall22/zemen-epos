import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Inject,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ConfigType } from '@nestjs/config';
import bcrypt from 'bcryptjs';

import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../audit/request-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionalEmailService } from '../notifications/transactional-email.service';
import { UsersService } from '../users/users.service';
import type {
  AuthUser,
  IssuedSession,
  JwtPayload,
  PendingAuthResponse,
} from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RefreshTokensService } from './refresh-tokens.service';
import { maskEmail, maskPhone, OtpService } from './otp.service';
import { authVerificationConfig } from './auth-verification.config';

/** Brute-force defense thresholds. After {@link LOCKOUT_THRESHOLD} consecutive
 *  failed sign-in attempts on the same account, the account is locked for
 *  {@link LOCKOUT_DURATION_MS}. Combined with the per-IP throttler on the
 *  login route (5/5min) and the global limiter (300/min/IP) this defends
 *  against both targeted account brute force and distributed credential
 *  stuffing. The counter resets on any successful login or when a super-admin
 *  saves the user. */
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/**
 * A real bcrypt hash at the same cost factor we use for production passwords.
 * We compare the supplied password against this whenever the email doesn't
 * match a user — equalising response time so an attacker can't tell "no such
 * account" from "wrong password" by timing alone. The plaintext is the
 * intentionally-unhelpful "no-account-timing-equalizer".
 */
const TIMING_DUMMY_HASH = bcrypt.hashSync('no-account-timing-equalizer', 10);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly context: RequestContextService,
    private readonly refreshTokens: RefreshTokensService,
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly transactionalEmail: TransactionalEmailService,
    @Inject(authVerificationConfig.KEY)
    private readonly verificationConfig: ConfigType<
      typeof authVerificationConfig
    >,
  ) {}

  async login(input: LoginDto): Promise<PendingAuthResponse> {
    const email = input.email.toLowerCase().trim();
    const user = await this.users.findByEmail(email);

    // Always perform a bcrypt compare, even when the account doesn't exist,
    // so the wall-clock cost of "no such user" matches "wrong password" and
    // attackers can't enumerate valid emails by timing alone. The dummy hash
    // is generated once at module load.
    const hashToCheck = user?.passwordHash ?? TIMING_DUMMY_HASH;
    const passwordMatches = await UsersService.verifyPassword(
      input.password,
      hashToCheck,
    );

    if (!user) {
      // Audit the attempt with the email the attacker tried, so a forensic
      // sweep can spot enumeration probes. The actor is the unauthenticated
      // caller — recorded via request context (ip, user-agent).
      await this.recordLoginFailure(email, 'unknown_user');
      throw new UnauthorizedException('Email or password is incorrect.');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      // Don't reveal whether the password was actually correct on a locked
      // account — the message tells the user what to do without confirming
      // a guess. We still audit so an operator sees the pattern.
      await this.recordLoginFailure(email, 'locked');
      const minutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new HttpException(
        `Too many failed sign-in attempts. Please wait about ${minutes} minute${minutes === 1 ? '' : 's'} and try again, or contact support to unlock the account.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!user.active) {
      await this.recordLoginFailure(email, 'disabled');
      throw new ForbiddenException('This account has been disabled.');
    }

    if (!passwordMatches) {
      // Bump the failed-attempt counter; if it crosses the threshold the user
      // row gets lockedUntil stamped. The caller still sees the same generic
      // message — they only learn the account is locked on their *next*
      // attempt (this is intentional; revealing the lockout state on the
      // attempt that triggers it would be a small information leak).
      const failed = await this.users.recordFailedLogin(
        user.id,
        LOCKOUT_THRESHOLD,
        LOCKOUT_DURATION_MS,
      );
      await this.recordLoginFailure(email, 'wrong_password');
      if (
        failed.failedLoginCount ===
        this.verificationConfig.failedLoginAlertThreshold
      ) {
        void this.transactionalEmail.notify({
          type: 'LOGIN_FAILURE_THRESHOLD',
          to: user.email,
          name: user.name,
          occurredAt: new Date(),
          attempts: failed.failedLoginCount,
          ip: this.context.get()?.ip,
        });
      }
      throw new UnauthorizedException('Email or password is incorrect.');
    }

    if (!user.emailVerifiedAt) {
      const pendingToken = this.otp.pendingToken(user.id, 'email-verification');
      let deliveryFailed = false;
      try {
        await this.otp.sendEmailVerification(user.id);
      } catch (err) {
        // Password authentication succeeded and the account still needs
        // verification. Keep that state usable even when SMTP is unavailable;
        // the verification page exposes an explicit resend action.
        deliveryFailed = true;
        this.logger.warn(
          `Initial verification delivery failed for user ${user.id}: ${(err as Error).name}`,
        );
      }
      return {
        step: 'email-verification',
        pendingToken,
        email: maskEmail(user.email),
        phone: null,
        deliveryFailed,
      };
    }

    // Password success deliberately does not mint access or refresh tokens.
    // The pending token is purpose-bound and accepted only by /auth/2fa/*.
    return {
      step: 'two-factor',
      pendingToken: this.otp.pendingToken(user.id, 'login-2fa'),
      email: maskEmail(user.email),
      phone: user.phone ? maskPhone(user.phone) : null,
    };
  }

  /**
   * Exchange a still-valid refresh token for a fresh access token and a
   * rotated refresh token. The presented refresh token is revoked and
   * chained to the new one via `replacedById`. If the user has been
   * disabled since their last successful sign-in, every active refresh
   * token of theirs is revoked and the request is rejected with 403 —
   * preventing a once-trusted device from continuing to mint access JWTs.
   */
  async refresh(rawToken: string): Promise<IssuedSession> {
    const { token, user } =
      await this.refreshTokens.consumeForRotation(rawToken);
    if (!user.active || !user.emailVerifiedAt) {
      // Disabled mid-session — purge sessions and refuse.
      await this.refreshTokens.revokeAll(user.id);
      throw new ForbiddenException('This account has been disabled.');
    }
    const next = await this.issueSession(user);
    await this.refreshTokens.revoke(token.id);
    return next;
  }

  /**
   * Revoke the supplied refresh token. Idempotent and silent — never reveals
   * whether the token was real, so an attacker can't probe.
   */
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.refreshTokens.revokeByRawToken(rawToken);
  }

  async completeLogin(userId: string, email: string): Promise<void> {
    const user = await this.users.recordLogin(userId);
    await this.recordLoginSuccess(userId, email);
    const request = this.context.get();
    void this.transactionalEmail.notify({
      type: 'LOGIN_SUCCEEDED',
      to: user.email,
      name: user.name,
      occurredAt: new Date(),
      ip: request?.ip,
      userAgent: request?.userAgent,
    });
  }

  /** Internal — build the JWT + a fresh refresh token + the LoginResponse
   *  envelope. Used by both login and refresh paths. */
  async issueSession(user: {
    id: string;
    email: string;
    name: string | null;
    role: AuthUser['role'];
    merchantId: string | null;
    branchId: string | null;
    language: string;
    emailVerifiedAt?: Date | null;
  }): Promise<IssuedSession> {
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('Email verification is required.');
    }
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      merchantId: user.merchantId,
      branchId: user.branchId,
    };
    const accessToken = this.jwt.sign(payload, {
      expiresIn: this.verificationConfig.accessTokenTtlSeconds,
    });
    const refresh = await this.refreshTokens.issue(user.id);
    return {
      token: accessToken,
      expiresIn: this.verificationConfig.accessTokenTtlSeconds,
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        merchantId: user.merchantId,
        branchId: user.branchId,
        language: user.language,
      },
    };
  }

  async me(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.users.findById(payload.sub);
    if (!user || !user.active || !user.emailVerifiedAt) {
      throw new UnauthorizedException('Session is no longer valid.');
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      merchantId: user.merchantId,
      branchId: user.branchId,
      language: user.language,
    };
  }

  /**
   * Persist the caller's preferred UI language. Accepts BCP-47 short codes
   * and refuses anything not on the enabled-languages list so a rogue
   * client can't drop garbage on the row.
   */
  async updateLanguage(userId: string, language: string): Promise<AuthUser> {
    const supported = new Set(['en', 'am']);
    if (!supported.has(language)) {
      throw new BadRequestException(`Unsupported language: ${language}`);
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { language },
    });
    return this.me({ sub: userId } as JwtPayload);
  }

  /**
   * Record a failed login attempt as an INBOUND audit row. The route itself
   * is `@Public()` so the AuditInterceptor skips it; this method exists so
   * brute-force probes still leave a trail. The attempted email goes into
   * `actorEmail` so the same operator query that surfaces successful actions
   * by email also surfaces failed sign-in attempts.
   */
  private async recordLoginFailure(
    attemptedEmail: string,
    reason: 'unknown_user' | 'wrong_password' | 'locked' | 'disabled',
  ): Promise<void> {
    const ctx = this.context.get();
    try {
      await this.audit.recordInbound({
        action: 'auth.login.failed',
        method: 'POST',
        path: '/auth/login',
        entityType: 'auth',
        entityId: null,
        success: false,
        statusCode:
          reason === 'locked'
            ? HttpStatus.TOO_MANY_REQUESTS
            : HttpStatus.UNAUTHORIZED,
        errorMessage: reason,
        actor: {
          // Stuff the attempted email into the actor slot so the audit page's
          // by-email filter picks it up. There's no signed-in user yet.
          sub: '',
          email: attemptedEmail,
          role: 'anonymous',
        },
      });
    } catch (err) {
      // Audit writes are best-effort everywhere else in the codebase too.
      this.logger.warn(
        `Failed to record auth.login.failed for ${attemptedEmail}: ${(err as Error).message}`,
      );
    }
    // Echo to logs at warn level so an operator scanning live logs notices
    // sustained failure patterns even without opening the /audit page.
    this.logger.warn(
      `Login failure: email=${attemptedEmail} reason=${reason} ip=${ctx?.ip ?? 'unknown'}`,
    );
  }

  /** Audit a successful sign-in. Counterpart to {@link recordLoginFailure};
   *  together they make every login attempt searchable by email. */
  private async recordLoginSuccess(
    userId: string,
    email: string,
  ): Promise<void> {
    try {
      await this.audit.recordInbound({
        action: 'auth.login.succeeded',
        method: 'POST',
        path: '/auth/login',
        entityType: 'auth',
        entityId: userId,
        success: true,
        statusCode: HttpStatus.OK,
        actor: { sub: userId, email, role: 'user' },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to record auth.login.succeeded for ${email}: ${(err as Error).message}`,
      );
    }
  }
}
