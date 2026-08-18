import {
  BadGatewayException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { JwtService } from '@nestjs/jwt';
import type { ConfigType } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { firstValueFrom } from 'rxjs';

import { PrismaService } from '../prisma/prisma.service';
import { authVerificationConfig } from './auth-verification.config';
import { maskEmail, maskPhone, OtpService } from './otp.service';
import type { PendingAuthResponse } from './auth.types';

interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
}

@Injectable()
export class GoogleOAuthService {
  constructor(
    private readonly http: HttpService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    @Inject(authVerificationConfig.KEY)
    private readonly config: ConfigType<typeof authVerificationConfig>,
  ) {}

  start(intent: 'login' | 'signup'): { url: string; nonce: string } {
    this.assertConfigured();
    const nonce = randomBytes(24).toString('base64url');
    const state = this.jwt.sign(
      { purpose: 'google-oauth-state', intent, nonce },
      { expiresIn: 10 * 60 },
    );
    const params = new URLSearchParams({
      client_id: this.config.google.clientId,
      redirect_uri: this.config.google.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      prompt: 'select_account',
    });
    return {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      nonce,
    };
  }

  async callback(code: string, state: string, cookieNonce: string) {
    this.assertConfigured();
    let statePayload: {
      purpose: string;
      intent: 'login' | 'signup';
      nonce: string;
    };
    try {
      statePayload = this.jwt.verify(state);
    } catch {
      throw new UnauthorizedException(
        'Google sign-in state is invalid or expired.',
      );
    }
    if (
      statePayload.purpose !== 'google-oauth-state' ||
      !cookieNonce ||
      statePayload.nonce !== cookieNonce
    ) {
      throw new UnauthorizedException(
        'Google sign-in state could not be verified.',
      );
    }

    let accessToken: string;
    try {
      const token = await firstValueFrom(
        this.http.post<{ access_token: string }>(
          'https://oauth2.googleapis.com/token',
          new URLSearchParams({
            code,
            client_id: this.config.google.clientId,
            client_secret: this.config.google.clientSecret,
            redirect_uri: this.config.google.redirectUri,
            grant_type: 'authorization_code',
          }).toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        ),
      );
      accessToken = token.data.access_token;
    } catch {
      throw new BadGatewayException('Google could not complete sign-in.');
    }

    let profile: GoogleProfile;
    try {
      const response = await firstValueFrom(
        this.http.get<GoogleProfile>(
          'https://openidconnect.googleapis.com/v1/userinfo',
          { headers: { Authorization: `Bearer ${accessToken}` } },
        ),
      );
      profile = response.data;
    } catch {
      throw new BadGatewayException('Google profile verification failed.');
    }
    if (!profile.sub || !profile.email || !profile.email_verified) {
      throw new ForbiddenException('A verified Google email is required.');
    }
    const email = profile.email.toLowerCase().trim();
    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleSubject: profile.sub }, { email }] },
    });
    if (user) {
      if (user.googleSubject && user.googleSubject !== profile.sub)
        throw new ForbiddenException(
          'This email is linked to another Google account.',
        );
      if (!user.googleSubject) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            googleSubject: profile.sub,
            emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
          },
        });
      }
      if (!user.active)
        throw new ForbiddenException('This account has been disabled.');
      const pending: PendingAuthResponse = {
        step: 'two-factor',
        pendingToken: this.otp.pendingToken(user.id, 'login-2fa'),
        email: maskEmail(user.email),
        phone: user.phone ? maskPhone(user.phone) : null,
      };
      return { mode: 'login' as const, pending };
    }
    const enrollmentToken = this.jwt.sign(
      {
        purpose: 'google-merchant-enrollment',
        googleSubject: profile.sub,
        email,
        name: profile.name?.trim() || null,
      },
      { expiresIn: 15 * 60 },
    );
    return { mode: 'signup' as const, enrollmentToken };
  }

  verifyEnrollmentToken(token: string): {
    googleSubject: string;
    email: string;
    name: string | null;
  } {
    try {
      const payload = this.jwt.verify(token) as Record<string, unknown>;
      if (
        payload.purpose !== 'google-merchant-enrollment' ||
        typeof payload.googleSubject !== 'string' ||
        typeof payload.email !== 'string'
      )
        throw new Error('purpose');
      return {
        googleSubject: payload.googleSubject,
        email: payload.email,
        name: typeof payload.name === 'string' ? payload.name : null,
      };
    } catch {
      throw new UnauthorizedException(
        'Google registration has expired. Start again.',
      );
    }
  }

  frontendUrl(path: string): string {
    return `${this.config.appPublicUrl}${path}`;
  }

  secureCookies(): boolean {
    return this.config.appPublicUrl.startsWith('https://');
  }

  private assertConfigured() {
    if (
      !this.config.google.clientId ||
      !this.config.google.clientSecret ||
      !this.config.google.redirectUri ||
      !this.config.appPublicUrl
    )
      throw new ServiceUnavailableException(
        'Google sign-in is not configured.',
      );
  }
}
