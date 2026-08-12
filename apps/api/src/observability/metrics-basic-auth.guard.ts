import { timingSafeEqual } from 'node:crypto';

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { Request, Response } from 'express';

import { metricsConfig } from './metrics.config';

/**
 * Basic-auth gate for `/metrics`. Defended with constant-time compare so a
 * brute-force attacker can't time-leak the password byte by byte. Returns
 * 401 with `WWW-Authenticate: Basic` so a curl `-u` retry works as expected;
 * Prometheus presents its credentials proactively and never sees the 401.
 */
@Injectable()
export class MetricsBasicAuthGuard implements CanActivate {
  constructor(
    @Inject(metricsConfig.KEY)
    private readonly config: ConfigType<typeof metricsConfig>,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const header = req.headers.authorization;
    if (!header || !header.toLowerCase().startsWith('basic ')) {
      this.challenge(res);
      throw new UnauthorizedException('Basic authentication required.');
    }
    const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString(
      'utf-8',
    );
    const sepIdx = decoded.indexOf(':');
    if (sepIdx < 0) {
      this.challenge(res);
      throw new UnauthorizedException('Malformed credentials.');
    }
    const user = decoded.slice(0, sepIdx);
    const password = decoded.slice(sepIdx + 1);
    if (!constantTimeMatches(user, this.config.user)) {
      this.challenge(res);
      throw new UnauthorizedException('Invalid credentials.');
    }
    if (!constantTimeMatches(password, this.config.password)) {
      this.challenge(res);
      throw new UnauthorizedException('Invalid credentials.');
    }
    return true;
  }

  private challenge(res: Response): void {
    res.setHeader('WWW-Authenticate', 'Basic realm="metrics"');
  }
}

/** Constant-time string compare. Equalises length first by padding shorter
 *  side to the longer's length — `timingSafeEqual` throws on length mismatch
 *  which would itself be a timing oracle. */
function constantTimeMatches(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf-8');
  const bBuf = Buffer.from(b, 'utf-8');
  const len = Math.max(aBuf.length, bBuf.length);
  const aPad = Buffer.alloc(len);
  const bPad = Buffer.alloc(len);
  aBuf.copy(aPad);
  bBuf.copy(bPad);
  // Even with equal-length buffers, an early-out on different lengths still
  // leaks via this final boolean — but the password material itself is
  // protected.
  return timingSafeEqual(aPad, bPad) && aBuf.length === bBuf.length;
}
