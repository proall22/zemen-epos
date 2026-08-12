import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, from, mergeMap } from 'rxjs';

import type { JwtPayload } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from './request-context.service';
import { SKIP_BRANCH_CONTEXT_KEY } from './skip-branch-context.decorator';

const BRANCH_HEADER = 'x-branch-id';

/**
 * Lifts an `X-Branch-Id` header onto the request context after validating
 * that the caller is allowed to act as that branch.
 *
 *   SUPER_ADMIN            — passes through (cross-tenant, no branch context).
 *   MERCHANT_ADMIN         — any branch of their merchant. Implicit access.
 *   CASHIER / ACCOUNTANT   — must have a UserBranch row for the requested
 *     / SUPPORT              branch OR match the pinned user.branchId.
 *
 * Rejects a mismatched header with 403 rather than silently dropping it —
 * the frontend should surface "you can't act as that branch" clearly.
 * Cross-tenant smuggling always refused.
 */
@Injectable()
export class BranchContextInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly reflector: Reflector,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_BRANCH_CONTEXT_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (skip) return next.handle();
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const user = req.user;
    if (!user) return next.handle();
    const headerValue = req.headers[BRANCH_HEADER];
    const branchId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!branchId) return next.handle();
    if (!user.merchantId) {
      // SUPER_ADMIN or unauthenticated route — ignore the header.
      return next.handle();
    }
    // Fast path: pinned branch matches the header. Skips the DB round-trip.
    if (user.branchId === branchId) {
      this.context.setBranch(branchId);
      return next.handle();
    }
    return from(this.resolveAccess(user, branchId)).pipe(
      mergeMap((allowed) => {
        if (!allowed) {
          throw new ForbiddenException(
            "You don't have access to that branch.",
          );
        }
        this.context.setBranch(branchId);
        return next.handle();
      }),
    );
  }

  /** Return true iff the user may act as `branchId`. Merchant scoping is
   *  enforced in the branch lookup; UserBranch rows are consulted for
   *  non-admin roles. */
  private async resolveAccess(
    user: JwtPayload,
    branchId: string,
  ): Promise<boolean> {
    // Branch must belong to the caller's merchant and be active.
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { merchantId: true, active: true },
    });
    if (!branch || branch.merchantId !== user.merchantId || !branch.active) {
      return false;
    }
    // MERCHANT_ADMIN has implicit access to every branch of their merchant.
    if (user.role === 'MERCHANT_ADMIN') return true;
    // Everyone else: match an explicit UserBranch grant.
    const grant = await this.prisma.userBranch.findUnique({
      where: { userId_branchId: { userId: user.sub, branchId } },
      select: { userId: true },
    });
    return !!grant;
  }
}

/** For consumers that want to know the header name up-front (SPA fetch). */
export const BRANCH_HEADER_NAME = BRANCH_HEADER;
