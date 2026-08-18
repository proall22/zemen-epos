import { createHash, randomBytes } from 'node:crypto';

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { RefreshToken, User } from '@prisma/client';

import { RequestContextService } from '../audit/request-context.service';
import { PrismaService } from '../prisma/prisma.service';

/** Refresh-token lifetime — 30 days. Long enough that a cashier on a steady
 *  shift schedule never re-enters credentials in the middle of work; short
 *  enough that an unused device naturally drops off. */
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Length of the raw token in bytes. 32 random bytes = 256 bits of entropy,
 *  serialised as 64 hex characters — well above brute-force feasibility. */
const REFRESH_TOKEN_BYTES = 32;

/** Stable hash of the opaque token. We don't salt — the token is itself
 *  random, so the hash collision space is the input entropy (256 bits). */
function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class RefreshTokensService {
  private readonly logger = new Logger(RefreshTokensService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  /**
   * Issue a fresh refresh token for a user. Returns the raw token (to send
   * to the client) and its expiry. The DB row stores only the hash.
   */
  async issue(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    const ctx = this.context.get();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hash(token),
        expiresAt,
        ip: ctx?.ip ?? null,
        userAgent: ctx?.userAgent ?? null,
      },
    });
    return { token, expiresAt };
  }

  /**
   * Look up a refresh token by raw value. Returns `{ token, user }` on a
   * good token; throws Unauthorized otherwise. Implements rotation reuse
   * detection: a token whose `revokedAt` is already set but whose
   * `expiresAt` has not yet passed is treated as evidence of compromise —
   * the response is 401 and every active refresh token for the user is
   * revoked. The legitimate user is forced to sign in again.
   */
  async consumeForRotation(rawToken: string): Promise<{
    token: RefreshToken;
    user: User;
  }> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash(rawToken) },
      include: { user: true },
    });
    if (!stored) {
      // Unknown token — no point clearing anything; just reject.
      throw new UnauthorizedException('Invalid refresh token.');
    }
    if (stored.revokedAt) {
      // Token was already used or explicitly revoked. If still inside its
      // expiry window, that's a strong signal that the legitimate user
      // already rotated it and someone else has the old copy. Nuke every
      // active session for the user.
      if (stored.expiresAt > new Date()) {
        this.logger.warn(
          `Refresh-token reuse detected for user ${stored.userId}; revoking all sessions.`,
        );
        await this.revokeAll(stored.userId);
      }
      throw new UnauthorizedException(
        'This sign-in session is no longer valid. Please sign in again.',
      );
    }
    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException(
        'This sign-in session has expired. Please sign in again.',
      );
    }
    return { token: stored, user: stored.user };
  }

  /**
   * Mark the supplied refresh token revoked and (optionally) record which
   * token replaced it. Used both by the rotation flow (chain old → new) and
   * the logout flow (no replacement).
   */
  async revoke(tokenId: string, replacedById?: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id: tokenId },
      data: {
        revokedAt: new Date(),
        replacedById: replacedById ?? null,
      },
    });
  }

  /** Revoke every active refresh token for a user — used by the reuse-
   *  detection path and by explicit "log me out everywhere" actions. */
  async revokeAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Convenience for the logout endpoint: revoke by raw token. Silently
   *  succeeds for unknown tokens — logout should never leak whether the
   *  token was valid. */
  async revokeByRawToken(rawToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
