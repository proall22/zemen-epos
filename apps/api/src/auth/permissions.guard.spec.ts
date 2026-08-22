import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import { PermissionsGuard } from './permissions.guard';

function ctx(user: Record<string, unknown>): ExecutionContext {
  const request = { user, headers: {} };
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function ctxWithHeaders(
  user: Record<string, unknown>,
  headers: Record<string, string>,
): ExecutionContext {
  const request = { user, headers };
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard security matrix', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const consent = { activeGrant: jest.fn() };
  const guard = new PermissionsGuard(reflector as never, consent as never);
  const user = (role: string, merchantId: string | null = 'm1') => ({
    sub: `user-${role}`,
    email: `${role.toLowerCase()}@example.com`,
    role,
    merchantId,
    branchId: role === 'CASHIER' ? 'b1' : null,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    consent.activeGrant.mockResolvedValue(null);
  });

  it('allows SUPER_ADMIN to manage global configuration', async () => {
    reflector.getAllAndOverride.mockReturnValue(['configuration.manage']);
    await expect(
      guard.canActivate(ctx(user('SUPER_ADMIN', null))),
    ).resolves.toBe(true);
  });

  it.each(['MERCHANT_ADMIN', 'ACCOUNTANT', 'CASHIER', 'SUPPORT'])(
    'denies %s global configuration management',
    async (role) => {
      reflector.getAllAndOverride.mockReturnValue(['configuration.manage']);
      await expect(guard.canActivate(ctx(user(role)))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    },
  );

  it('denies native SUPER_ADMIN access to merchant invoices without consent', async () => {
    reflector.getAllAndOverride.mockReturnValue(['invoice.view']);
    await expect(
      guard.canActivate(ctx(user('SUPER_ADMIN', null))),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows only the merchant-data scope supplied by an active consent grant', async () => {
    reflector.getAllAndOverride.mockReturnValue(['invoice.view']);
    consent.activeGrant.mockResolvedValue({ scopes: ['INVOICES'] });

    await expect(
      guard.canActivate(
        ctxWithHeaders(user('SUPER_ADMIN', null), {
          'x-consent-merchant-id': 'merchant-a',
        }),
      ),
    ).resolves.toBe(true);
    expect(consent.activeGrant).toHaveBeenCalledWith(
      'user-SUPER_ADMIN',
      'merchant-a',
    );
  });

  it('does not treat an expired or revoked consent grant as authorization', async () => {
    reflector.getAllAndOverride.mockReturnValue(['invoice.view']);
    consent.activeGrant.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        ctxWithHeaders(user('SUPER_ADMIN', null), {
          'x-consent-merchant-id': 'merchant-a',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
