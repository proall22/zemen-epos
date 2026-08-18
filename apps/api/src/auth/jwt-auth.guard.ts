import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import type { JwtPayload } from './auth.types';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
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
      (request as Request & { user: JwtPayload }).user = payload;
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
