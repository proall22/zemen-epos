import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

import type { ActiveConsent } from '../auth/permissions.guard';
import { RequestContextService } from './request-context.service';

/**
 * Pins the request context to a merchant on behalf of a consented SUPER_ADMIN.
 * The PermissionsGuard has already validated the `X-Consent-Merchant-Id` header
 * against a live grant and stamped `req.activeConsent`; here we only lift that
 * onto the request context. Must run AFTER AuditInterceptor (whose setActor
 * seeds merchantId=null for a super-admin) so this override wins — see the
 * registration order in audit.module.ts. Once set, every tenant-scoped query
 * pins to the consented merchant automatically (common/tenant-scope.ts).
 */
@Injectable()
export class ConsentContextInterceptor implements NestInterceptor {
  constructor(private readonly context: RequestContextService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { activeConsent?: ActiveConsent }>();
    const consent = req.activeConsent;
    if (consent) {
      this.context.setMerchant(consent.merchantId, consent.scopes);
    }
    return next.handle();
  }
}
