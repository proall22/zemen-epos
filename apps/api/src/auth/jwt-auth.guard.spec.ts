import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import { JwtAuthGuard } from './jwt-auth.guard';

function context(token: string): ExecutionContext {
  const request = { headers: { authorization: `Bearer ${token}` } };
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function contextWithoutToken(): ExecutionContext {
  const request = { headers: {} };
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard token scope', () => {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
  const activeUser = {
    id: 'u1',
    email: 'a@example.com',
    role: 'CASHIER',
    active: true,
    emailVerifiedAt: new Date(),
    merchantId: 'm1',
    branchId: 'b1',
  };
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(activeUser) },
    branch: { findFirst: jest.fn().mockResolvedValue({ id: 'b1' }) },
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when no access token is supplied', async () => {
    const guard = new JwtAuthGuard(
      reflector as never,
      { verify: jest.fn() } as never,
      prisma as never,
    );
    await expect(
      guard.canActivate(contextWithoutToken()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a correctly signed pending 2FA token as an access token', async () => {
    const jwt = {
      verify: jest.fn().mockReturnValue({ sub: 'u1', purpose: 'login-2fa' }),
    };
    const guard = new JwtAuthGuard(
      reflector as never,
      jwt as never,
      prisma as never,
    );
    await expect(guard.canActivate(context('pending'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts a full access-token payload after resolving current account state', async () => {
    const jwt = {
      verify: jest.fn().mockReturnValue({
        sub: 'u1',
        email: 'a@example.com',
        role: 'CASHIER',
        merchantId: 'm1',
        branchId: 'b1',
      }),
    };
    const guard = new JwtAuthGuard(
      reflector as never,
      jwt as never,
      prisma as never,
    );
    await expect(guard.canActivate(context('access'))).resolves.toBe(true);
  });

  it('rejects a disabled account even while its JWT remains valid', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      ...activeUser,
      active: false,
    });
    const jwt = {
      verify: jest.fn().mockReturnValue({
        sub: 'u1',
        email: 'a@example.com',
        role: 'CASHIER',
        merchantId: 'm1',
        branchId: 'b1',
      }),
    };
    const guard = new JwtAuthGuard(
      reflector as never,
      jwt as never,
      prisma as never,
    );
    await expect(guard.canActivate(context('access'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a stale branch assignment that is inactive or cross-tenant', async () => {
    prisma.branch.findFirst.mockResolvedValueOnce(null);
    const jwt = {
      verify: jest.fn().mockReturnValue({
        sub: 'u1',
        email: 'a@example.com',
        role: 'CASHIER',
        merchantId: 'm1',
        branchId: 'b1',
      }),
    };
    const guard = new JwtAuthGuard(
      reflector as never,
      jwt as never,
      prisma as never,
    );
    await expect(guard.canActivate(context('access'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
