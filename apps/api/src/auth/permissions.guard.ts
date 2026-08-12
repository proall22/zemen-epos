import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { ConsentService } from '../consent/consent.service';
import type { JwtPayload } from './auth.types';
import { hasPermission } from './permissions';
import { REQUIRED_PERMISSIONS_KEY } from './require-permissions.decorator';

/** Header a SUPER_ADMIN sends to act inside a consented merchant. */
export const CONSENT_MERCHANT_HEADER = 'x-consent-merchant-id';

/** Stamped on the request by the guard when a SUPER_ADMIN presents a valid
 *  consent header; the ConsentContextInterceptor reads it to pin the merchant. */
export interface ActiveConsent {
  merchantId: string;
  scopes: string[];
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly consent: ConsentService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload; activeConsent?: ActiveConsent }>();
    const user = request.user;

    // Resolve a consent grant for a SUPER_ADMIN carrying the consent header,
    // independent of whether this route is permission-gated — the interceptor
    // needs `activeConsent` to pin ctx.merchantId so scoped queries work.
    //
    // A header with no live grant (expired / revoked / never accepted) is
    // ignored, NOT rejected: the super-admin falls back to their platform view,
    // so platform routes keep working. Any merchant-scoped route they hit will
    // still 403 below — the required scope simply isn't in their effective set
    // without a grant — which is the meaningful signal, without breaking
    // unrelated platform actions on a stale header.
    let consentScopes: string[] | undefined;
    if (user && user.role === 'SUPER_ADMIN') {
      const header = readHeader(request, CONSENT_MERCHANT_HEADER);
      if (header) {
        const grant = await this.consent.activeGrant(user.sub, header);
        if (grant) {
          consentScopes = grant.scopes;
          request.activeConsent = { merchantId: header, scopes: grant.scopes };
        }
      }
    }

    if (!required || required.length === 0) return true;

    if (!user) {
      // JwtAuthGuard runs before us and rejects when there's no token, so this
      // path only fires for genuinely unauthenticated requests on protected
      // routes — surface as forbidden, not 500.
      throw new ForbiddenException('Sign in required.');
    }

    const ok = required.every((code) =>
      hasPermission(user.role, code, consentScopes),
    );
    if (!ok) {
      throw new ForbiddenException(
        "You don't have permission to perform this action.",
      );
    }

    // Defense-in-depth tenant check: any user with a merchant-scoped role must
    // have a merchantId on their JWT. SUPER_ADMIN is the only role allowed
    // to operate without one (cross-tenant back-office). A misconfigured
    // user — role = ACCOUNTANT but merchantId = null — would otherwise sail
    // past tenant-scope helpers (they no-op when merchantId is null) and read
    // across tenants. Refuse the request instead.
    if (user.role !== 'SUPER_ADMIN' && !user.merchantId) {
      throw new ForbiddenException(
        'Your account is not assigned to a merchant. Contact support.',
      );
    }
    return true;
  }
}

function readHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
