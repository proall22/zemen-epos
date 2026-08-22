import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from './auth.types';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearer(request);
    if (!token) {
      throw new UnauthorizedException('Sign in to continue.');
    }
    try {
      const payload = this.jwt.verify<JwtPayload & { purpose?: string }>(token);
      // Pending email-verification / 2FA tokens share the signing key but are
      // deliberately not access tokens. Fail closed even on routes without a
      // permission decorator (for example /auth/me).
      const roles = new Set([
        'SUPER_ADMIN',
        'ADMIN',
        'MERCHANT_ADMIN',
        'BRANCH_ADMIN',
        'ACCOUNTANT',
        'STORE_KEEPER',
        'CASHIER',
        'SUPPORT',
      ]);
      if (
        payload.purpose ||
        !payload.sub ||
        !payload.email ||
        !roles.has(payload.role)
      ) {
        throw new Error('Not an access token');
      }
      // JWT claims identify the session, but mutable authorization state must
      // come from the database. This makes disable, role change, merchant
      // reassignment, and branch reassignment effective immediately instead
      // of leaving the old privilege live until token expiry.
      const current = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          role: true,
          active: true,
          emailVerifiedAt: true,
          merchantId: true,
          branchId: true,
        },
      });
      if (!current?.active || !current.emailVerifiedAt) {
        throw new Error('Account is disabled or unverified');
      }
      if (current.role !== 'SUPER_ADMIN' && !current.merchantId) {
        throw new Error('Merchant assignment is missing');
      }
      if (current.branchId) {
        const branch = await this.prisma.branch.findFirst({
          where: {
            id: current.branchId,
            merchantId: current.merchantId ?? undefined,
            active: true,
          },
          select: { id: true },
        });
        if (!branch) throw new Error('Branch assignment is no longer valid');
      }
      (request as Request & { user: JwtPayload }).user = {
        sub: current.id,
        email: current.email,
        role: current.role,
        merchantId: current.merchantId,
        branchId: current.branchId,
      };
      return true;
    } catch {
      throw new UnauthorizedException(
        'Your session has expired. Please sign in again.',
      );
    }
  }
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}
