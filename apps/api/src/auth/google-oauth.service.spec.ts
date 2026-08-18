import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { of } from 'rxjs';

import { GoogleOAuthService } from './google-oauth.service';

describe('GoogleOAuthService', () => {
  const config = {
    appPublicUrl: 'http://localhost:4999',
    google: {
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'http://localhost:4999/api/auth/google/callback',
    },
  };
  const http = { post: jest.fn(), get: jest.fn() };
  const jwt = { sign: jest.fn(), verify: jest.fn() };
  const prisma = {
    user: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const otp = { pendingToken: jest.fn() };

  const service = () =>
    new GoogleOAuthService(
      http as never,
      jwt as never,
      prisma as never,
      otp as never,
      config as never,
    );

  beforeEach(() => jest.clearAllMocks());

  it('uses non-Secure cookies only for an explicit HTTP development URL', () => {
    expect(service().secureCookies()).toBe(false);
    const httpsService = new GoogleOAuthService(
      http as never,
      jwt as never,
      prisma as never,
      otp as never,
      { ...config, appPublicUrl: 'https://pos.example.com' } as never,
    );
    expect(httpsService.secureCookies()).toBe(true);
  });

  it('creates an authorization URL with signed state and an exact redirect URI', () => {
    jwt.sign.mockReturnValue('signed-state');
    const result = service().start('signup');
    const url = new URL(result.url);

    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      config.google.redirectUri,
    );
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBe('signed-state');
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'google-oauth-state',
        intent: 'signup',
      }),
      { expiresIn: 600 },
    );
  });

  it('rejects a callback whose state is not bound to the browser cookie', async () => {
    jwt.verify.mockReturnValue({
      purpose: 'google-oauth-state',
      intent: 'login',
      nonce: 'expected',
    });
    await expect(
      service().callback('code', 'state', 'different'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(http.post).not.toHaveBeenCalled();
  });

  it('requires Google to attest that the email is verified', async () => {
    jwt.verify.mockReturnValue({
      purpose: 'google-oauth-state',
      intent: 'signup',
      nonce: 'nonce',
    });
    http.post.mockReturnValue(of({ data: { access_token: 'access' } }));
    http.get.mockReturnValue(
      of({
        data: {
          sub: 'google-subject',
          email: 'person@example.com',
          email_verified: false,
        },
      }),
    );
    await expect(
      service().callback('code', 'state', 'nonce'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('sends an existing Google user to 2FA instead of issuing a session', async () => {
    jwt.verify.mockReturnValue({
      purpose: 'google-oauth-state',
      intent: 'login',
      nonce: 'nonce',
    });
    http.post.mockReturnValue(of({ data: { access_token: 'access' } }));
    http.get.mockReturnValue(
      of({
        data: {
          sub: 'google-subject',
          email: 'Person@Example.com',
          email_verified: true,
        },
      }),
    );
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'person@example.com',
      phone: null,
      active: true,
      googleSubject: 'google-subject',
    });
    otp.pendingToken.mockReturnValue('pending-2fa');

    await expect(service().callback('code', 'state', 'nonce')).resolves.toEqual(
      {
        mode: 'login',
        pending: {
          step: 'two-factor',
          pendingToken: 'pending-2fa',
          email: 'p***@example.com',
          phone: null,
        },
      },
    );
    expect(otp.pendingToken).toHaveBeenCalledWith('user-1', 'login-2fa');
  });

  it('returns only a signed enrollment token for a new Google identity', async () => {
    jwt.verify.mockReturnValue({
      purpose: 'google-oauth-state',
      intent: 'signup',
      nonce: 'nonce',
    });
    jwt.sign.mockReturnValue('enrollment-token');
    http.post.mockReturnValue(of({ data: { access_token: 'access' } }));
    http.get.mockReturnValue(
      of({
        data: {
          sub: 'google-subject',
          email: 'person@example.com',
          email_verified: true,
          name: 'Person Name',
        },
      }),
    );
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service().callback('code', 'state', 'nonce')).resolves.toEqual(
      {
        mode: 'signup',
        enrollmentToken: 'enrollment-token',
      },
    );
    expect(jwt.sign).toHaveBeenCalledWith(
      {
        purpose: 'google-merchant-enrollment',
        googleSubject: 'google-subject',
        email: 'person@example.com',
        name: 'Person Name',
      },
      { expiresIn: 900 },
    );
  });
});
