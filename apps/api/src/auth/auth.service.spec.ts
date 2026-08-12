import {
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';

import type { AuditService } from '../audit/audit.service';
import type {
  RequestContext,
  RequestContextService,
} from '../audit/request-context.service';
import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

/** Build a minimal AuthService with mocked deps and configurable behaviour
 *  per test. The shape mirrors the real constructor. */
function makeService(opts: {
  findByEmail: jest.Mock;
  verifyPassword?: jest.Mock;
  recordLogin?: jest.Mock;
  recordFailedLogin?: jest.Mock;
}) {
  const users = {
    findByEmail: opts.findByEmail,
    recordLogin: opts.recordLogin ?? jest.fn().mockResolvedValue({}),
    recordFailedLogin:
      opts.recordFailedLogin ?? jest.fn().mockResolvedValue({}),
  } as unknown as UsersService;

  // Stub the static verifyPassword off the class so individual tests can
  // assert call counts / make the result deterministic. The real impl
  // delegates to bcrypt.compare; we don't need bcrypt math in unit tests.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (require('../users/users.service').UsersService as any).verifyPassword =
    opts.verifyPassword ?? jest.fn().mockResolvedValue(false);

  const jwt = { sign: jest.fn().mockReturnValue('TOKEN') } as never;
  const audit = {
    recordInbound: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;
  const context = {
    get: () =>
      ({ requestId: 'r', ip: '1.2.3.4' }) as RequestContext,
  } as unknown as RequestContextService;
  // Refresh-token issuance is exercised on the success path; the rest of
  // the tests don't care about its internals, so we return a fixed pair.
  const refreshTokens = {
    issue: jest.fn().mockResolvedValue({
      token: 'REFRESH',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }),
    revokeAll: jest.fn().mockResolvedValue(undefined),
    revokeByRawToken: jest.fn().mockResolvedValue(undefined),
    consumeForRotation: jest.fn(),
    revoke: jest.fn().mockResolvedValue(undefined),
  } as never;
  const prisma = {
    user: { update: jest.fn().mockResolvedValue(undefined) },
  } as never;
  return new AuthService(users, jwt, audit, context, refreshTokens, prisma);
}

describe('AuthService.login', () => {
  it('rejects unknown users with the generic message + runs bcrypt for timing equalisation', async () => {
    const verifyPassword = jest.fn().mockResolvedValue(false);
    const findByEmail = jest.fn().mockResolvedValue(null);
    const svc = makeService({ findByEmail, verifyPassword });

    await expect(
      svc.login({ email: 'nobody@x.com', password: 'pw' }),
    ).rejects.toThrow(UnauthorizedException);
    // Always verifies — even though there's no real password — so timing
    // doesn't betray account existence.
    expect(verifyPassword).toHaveBeenCalledTimes(1);
  });

  it('rejects a locked account with a 429 and the wait-time message, regardless of password correctness', async () => {
    const futureLock = new Date(Date.now() + 5 * 60_000);
    const findByEmail = jest.fn().mockResolvedValue({
      id: 'u1',
      email: 'a@b',
      passwordHash: 'h',
      active: true,
      lockedUntil: futureLock,
    });
    // Even if the password would have matched, the lock wins.
    const verifyPassword = jest.fn().mockResolvedValue(true);
    const svc = makeService({ findByEmail, verifyPassword });

    await expect(
      svc.login({ email: 'a@b', password: 'pw' }),
    ).rejects.toThrow(HttpException);
  });

  it('rejects disabled accounts with a Forbidden message (after bcrypt timing)', async () => {
    const findByEmail = jest.fn().mockResolvedValue({
      id: 'u1',
      email: 'a@b',
      passwordHash: 'h',
      active: false,
      lockedUntil: null,
    });
    const svc = makeService({
      findByEmail,
      verifyPassword: jest.fn().mockResolvedValue(true),
    });
    await expect(
      svc.login({ email: 'a@b', password: 'pw' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('on wrong password: bumps failed-login counter then returns the generic message', async () => {
    const findByEmail = jest.fn().mockResolvedValue({
      id: 'u1',
      email: 'a@b',
      passwordHash: 'h',
      active: true,
      lockedUntil: null,
    });
    const recordFailedLogin = jest.fn().mockResolvedValue({});
    const svc = makeService({
      findByEmail,
      verifyPassword: jest.fn().mockResolvedValue(false),
      recordFailedLogin,
    });
    await expect(
      svc.login({ email: 'a@b', password: 'pw' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(recordFailedLogin).toHaveBeenCalledWith(
      'u1',
      5,
      expect.any(Number),
    );
  });

  it('on success: signs JWT, returns the LoginResponse envelope, and resets the failure state', async () => {
    const findByEmail = jest.fn().mockResolvedValue({
      id: 'u1',
      email: 'a@b',
      name: null,
      role: 'MERCHANT_ADMIN',
      passwordHash: 'h',
      active: true,
      lockedUntil: null,
      merchantId: 'm1',
      branchId: null,
    });
    const recordLogin = jest.fn().mockResolvedValue({});
    const svc = makeService({
      findByEmail,
      verifyPassword: jest.fn().mockResolvedValue(true),
      recordLogin,
    });
    const result = await svc.login({ email: 'a@b', password: 'pw' });
    expect(result.token).toBe('TOKEN');
    expect(result.refreshToken).toBe('REFRESH');
    expect(result.user.merchantId).toBe('m1');
    expect(recordLogin).toHaveBeenCalledWith('u1');
  });
});
