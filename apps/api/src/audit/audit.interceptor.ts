import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

import type { JwtPayload } from '../auth/auth.types';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/require-permissions.decorator';
import { AuditService } from './audit.service';
import { RequestContextService } from './request-context.service';

/** Only state-changing verbs are audited as INBOUND actions; reads are skipped. */
const AUDITED_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    private readonly context: RequestContextService,
    private readonly reflector: Reflector,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();

    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const user = req.user;

    // Make the actor available to any outbound EIRMS call this request triggers.
    if (user) this.context.setActor(user);

    const method = req.method?.toUpperCase();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    // Skip reads and public routes (login, QR, public invoice) — keeps the
    // trail focused on real, attributable changes.
    if (!method || !AUDITED_METHODS.has(method) || isPublic) {
      return next.handle();
    }

    const action = this.resolveAction(ctx, method);
    const base = {
      action,
      method,
      path: req.originalUrl || req.url,
      entityType: action.includes('.') ? action.split('.')[0] : null,
      entityId: (req.params?.id as string | undefined) ?? null,
      actor: user ?? null,
    };

    return next.handle().pipe(
      tap({
        next: () => {
          void this.audit.recordInbound({
            ...base,
            success: true,
            statusCode: res.statusCode,
          });
        },
        error: (err: unknown) => {
          void this.audit.recordInbound({
            ...base,
            success: false,
            statusCode: (err as { status?: number })?.status,
            errorMessage: (err as Error)?.message,
          });
        },
      }),
    );
  }

  /** The action label = the route's required permission (e.g. "invoice.create"),
   *  falling back to "<controller>.<method>" for routes without one. */
  private resolveAction(ctx: ExecutionContext, method: string): string {
    const perms = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (perms && perms.length > 0) return perms[0];
    const controller = ctx
      .getClass()
      .name.replace(/Controller$/, '')
      .toLowerCase();
    return `${controller}.${method.toLowerCase()}`;
  }
}
