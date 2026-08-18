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

describe('JwtAuthGuard token scope', () => {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };

  it('rejects a correctly signed pending 2FA token as an access token', () => {
    const jwt = { verify: jest.fn().mockReturnValue({ sub: 'u1', purpose: 'login-2fa' }) };
    const guard = new JwtAuthGuard(reflector as never, jwt as never);
    expect(() => guard.canActivate(context('pending'))).toThrow(UnauthorizedException);
  });

  it('accepts a full access-token payload', () => {
    const jwt = { verify: jest.fn().mockReturnValue({ sub: 'u1', email: 'a@example.com', role: 'CASHIER', merchantId: 'm1', branchId: 'b1' }) };
    const guard = new JwtAuthGuard(reflector as never, jwt as never);
    expect(guard.canActivate(context('access'))).toBe(true);
  });
});
