import { randomInt } from 'node:crypto';

import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AuthChallengeType, User } from '@prisma/client';
import { AxiosError } from 'axios';
import bcrypt from 'bcryptjs';
import { firstValueFrom } from 'rxjs';

import { RequestContextService } from '../audit/request-context.service';
import { notificationsConfig } from '../notifications/notifications.config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthMailService } from './auth-mail.service';
import { authVerificationConfig } from './auth-verification.config';

type PendingPurpose = 'email-verification' | 'login-2fa';
interface PendingPayload {
  sub: string;
  purpose: PendingPurpose;
}

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: AuthMailService,
    private readonly http: HttpService,
    private readonly context: RequestContextService,
    @Inject(authVerificationConfig.KEY)
    private readonly config: ConfigType<typeof authVerificationConfig>,
    @Inject(notificationsConfig.KEY)
    private readonly notifications: ConfigType<typeof notificationsConfig>,
  ) {}

  pendingToken(userId: string, purpose: PendingPurpose): string {
    return this.jwt.sign(
      { sub: userId, purpose },
      { expiresIn: this.config.pendingTokenTtlSeconds },
    );
  }

  readPending(token: string, purpose: PendingPurpose): PendingPayload {
    try {
      const payload = this.jwt.verify<PendingPayload>(token);
      if (payload.purpose !== purpose || !payload.sub) throw new Error('scope');
      return payload;
    } catch {
      throw new UnauthorizedException(
        'Authentication step expired. Please start again.',
      );
    }
  }

  async describeLogin(token: string) {
    const { sub } = this.readPending(token, 'login-2fa');
    const user = await this.prisma.user.findUnique({ where: { id: sub } });
    if (!user?.active || !user.emailVerifiedAt) {
      throw new UnauthorizedException(
        'Authentication step is no longer valid.',
      );
    }
    return {
      email: maskEmail(user.email),
      phone: user.phone ? maskPhone(user.phone) : null,
      phoneAvailable: Boolean(user.phone && this.notifications.sms.enabled),
    };
  }

  async sendEmailVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.emailVerifiedAt) return;
    const otp = await this.create(user.id, 'EMAIL_VERIFICATION');
    await this.mail.sendVerificationCode(user.email, otp);
  }

  async resendEmailVerification(token: string): Promise<void> {
    const { sub } = this.readPending(token, 'email-verification');
    await this.sendEmailVerification(sub);
  }

  async verifyEmail(token: string, otp: string): Promise<User> {
    const { sub } = this.readPending(token, 'email-verification');
    const user = await this.prisma.user.findUnique({ where: { id: sub } });
    if (!user)
      throw new BadRequestException('Verification code is invalid or expired.');
    if (user.emailVerifiedAt) return user;
    await this.consume(sub, 'EMAIL_VERIFICATION', otp);
    return this.prisma.user.update({
      where: { id: sub },
      data: { emailVerifiedAt: new Date() },
    });
  }

  async sendTwoFactor(token: string, method: 'email' | 'phone'): Promise<void> {
    const { sub } = this.readPending(token, 'login-2fa');
    const user = await this.prisma.user.findUnique({ where: { id: sub } });
    if (!user?.active || !user.emailVerifiedAt) {
      throw new UnauthorizedException(
        'Authentication step is no longer valid.',
      );
    }
    if (method === 'email') {
      const otp = await this.create(sub, 'LOGIN_EMAIL');
      await this.mail.sendLoginCode(
        user.email,
        otp,
        this.context.get()?.userAgent,
      );
      return;
    }
    if (!user.phone)
      throw new BadRequestException('No registered phone number is available.');
    if (!this.notifications.sms.enabled) {
      throw new ServiceUnavailableException(
        'SMS verification is not configured.',
      );
    }
    const otp = await this.create(sub, 'LOGIN_PHONE');
    await this.sendSms(
      user.phone,
      `Your Zemen ePOS verification code is ${otp}. It expires in ${Math.ceil(this.config.otpTtlSeconds / 60)} minutes. Do not share it.`,
    );
  }

  async verifyTwoFactor(
    token: string,
    method: 'email' | 'phone',
    otp: string,
  ): Promise<User> {
    const { sub } = this.readPending(token, 'login-2fa');
    const type: AuthChallengeType =
      method === 'email' ? 'LOGIN_EMAIL' : 'LOGIN_PHONE';
    await this.consume(sub, type, otp);
    const user = await this.prisma.user.findUnique({ where: { id: sub } });
    if (!user?.active || !user.emailVerifiedAt) {
      throw new UnauthorizedException(
        'Authentication step is no longer valid.',
      );
    }
    if (method === 'phone' && !user.phoneVerifiedAt) {
      return this.prisma.user.update({
        where: { id: sub },
        data: { phoneVerifiedAt: new Date() },
      });
    }
    return user;
  }

  private async create(
    userId: string,
    type: AuthChallengeType,
  ): Promise<string> {
    const latest = await this.prisma.authChallenge.findFirst({
      where: { userId, type },
      orderBy: { createdAt: 'desc' },
    });
    const cooldownMs = this.config.otpResendCooldownSeconds * 1000;
    if (latest && Date.now() - latest.createdAt.getTime() < cooldownMs) {
      const retry = Math.ceil(
        (cooldownMs - (Date.now() - latest.createdAt.getTime())) / 1000,
      );
      throw new HttpException(
        `Please wait ${retry} seconds before requesting another code.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const otp = Array.from({ length: this.config.otpLength }, () =>
      randomInt(0, 10),
    ).join('');
    const otpHash = await bcrypt.hash(otp, 10);
    await this.prisma.$transaction([
      this.prisma.authChallenge.updateMany({
        where: { userId, type, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.authChallenge.create({
        data: {
          userId,
          type,
          otpHash,
          expiresAt: new Date(Date.now() + this.config.otpTtlSeconds * 1000),
        },
      }),
    ]);
    return otp;
  }

  private async consume(
    userId: string,
    type: AuthChallengeType,
    otp: string,
  ): Promise<void> {
    const challenge = await this.prisma.authChallenge.findFirst({
      where: { userId, type, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge || challenge.expiresAt <= new Date()) {
      throw new BadRequestException('Verification code is invalid or expired.');
    }
    if (challenge.attempts >= this.config.otpMaxAttempts) {
      throw new HttpException(
        'Too many verification attempts. Request a new code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const valid =
      /^\d{6,8}$/.test(otp) && (await bcrypt.compare(otp, challenge.otpHash));
    if (!valid) {
      const updated = await this.prisma.authChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      if (updated.attempts >= this.config.otpMaxAttempts) {
        throw new HttpException(
          'Too many verification attempts. Request a new code.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new BadRequestException('Verification code is invalid or expired.');
    }
    const result = await this.prisma.authChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (result.count !== 1)
      throw new ForbiddenException('Verification code has already been used.');
  }

  private async sendSms(to: string, message: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(
          `${this.notifications.sms.baseUrl}/api/v1/messages/sms/send`,
          { to, from: this.notifications.sms.shortCode, message },
          {
            headers: {
              'X-API-KEY': this.notifications.sms.apiKey,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
    } catch (error) {
      const status =
        error instanceof AxiosError ? error.response?.status : undefined;
      throw new ServiceUnavailableException(
        `SMS verification could not be sent${status ? ` (provider status ${status})` : ''}.`,
      );
    }
  }
}

export function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  return `${name?.slice(0, 1) ?? '*'}***@${domain ?? ''}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `${phone.trim().startsWith('+') ? '+' : ''}${digits.slice(0, 3)} *** *** ${digits.slice(-3)}`;
}
