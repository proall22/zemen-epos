import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerRequest } from '@nestjs/throttler/dist/throttler.guard.interface';
import type { Request } from 'express';

import type { JwtPayload } from '../auth/auth.types';

/**
 * Tracker: prefer the authenticated user's id so a signed-in user shares
 * one rate budget across devices and IPs; fall back to the request IP for
 * anonymous calls.
 *
 * Why not pure-IP: NAT and corporate proxies collapse many users behind one
 * IP — a single noisy user there would block their colleagues. Why not
 * pure-user: anonymous endpoints (login, signup, QR images) have no user yet.
 */
@Injectable()
export class UserOrIpThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(UserOrIpThrottlerGuard.name);

  protected getTracker(
    req: Request & { user?: JwtPayload },
  ): Promise<string> {
    const userId = req.user?.sub;
    if (userId) return Promise.resolve(`u:${userId}`);
    return Promise.resolve(`ip:${req.ip ?? 'unknown'}`);
  }

  /** Fail-open on Redis transport errors; re-throw genuine 429s. */
  protected async handleRequest(props: ThrottlerRequest): Promise<boolean> {
    try {
      return await super.handleRequest(props);
    } catch (err) {
      if (err instanceof ThrottlerException) throw err;
      this.logger.warn(
        `Throttler storage unreachable — failing open: ${(err as Error).message}`,
      );
      return true;
    }
  }
}
