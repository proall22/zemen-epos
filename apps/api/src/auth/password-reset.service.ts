import { createHash, randomBytes } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';

import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../audit/request-context.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RefreshTokensService } from './refresh-tokens.service';

const RESET_TOKEN_BYTES = 32;
const RESET_TTL_MS = 30 * 60 * 1000;

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly notifications: NotificationsService,
    private readonly refreshTokens: RefreshTokensService,
    private readonly audit: AuditService,
  ) {}

  /** Always returns silently — never reveals whether the email matched a user.
   *  When a user matches, voids any prior unused tokens for that user, issues
   *  a fresh one, queues the email. */
  async request(email: string): Promise<void> {
    const normalised = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: normalised },
      select: { id: true, active: true },
    });
    if (!user || !user.active) {
      await this.audit
        .recordInbound({
          action: 'auth.password-reset.requested',
          method: 'POST',
          path: '/auth/forgot-password',
          entityType: 'auth',
          entityId: null,
          success: true,
          actor: { sub: '', email: normalised, role: 'anonymous' },
          errorMessage: user ? 'inactive' : 'unknown_user',
        })
        .catch(() => undefined);
      return;
    }

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const rawToken = randomBytes(RESET_TOKEN_BYTES).toString('hex');
    const ctx = this.context.get();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hash(rawToken),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
        ip: ctx?.ip ?? null,
        userAgent: ctx?.userAgent ?? null,
      },
    });

    await this.notifications.enqueue({
      action: 'auth.password-reset',
      userId: user.id,
      rawToken,
    });

    await this.audit
      .recordInbound({
        action: 'auth.password-reset.requested',
        method: 'POST',
        path: '/auth/forgot-password',
        entityType: 'user',
        entityId: user.id,
        success: true,
        actor: { sub: user.id, email: normalised, role: 'user' },
      })
      .catch(() => undefined);
  }

  /** Validates the token, applies the new password, voids the token + every
   *  refresh-token the user has so any active session is forced to re-sign-in. */
  async reset(rawToken: string, newPassword: string): Promise<void> {
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hash(rawToken) },
      include: { user: { select: { id: true, email: true, active: true } } },
    });
    const reason = this.failureReason(row);
    if (!row || reason) {
      await this.audit
        .recordInbound({
          action: 'auth.password-reset.failed',
          method: 'POST',
          path: '/auth/reset-password',
          entityType: 'auth',
          entityId: row?.userId ?? null,
          success: false,
          errorMessage: reason ?? 'unknown_token',
        })
        .catch(() => undefined);
      throw new BadRequestException(
        'This reset link is no longer valid. Please request a new one.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: row.userId },
        data: {
          passwordHash: await bcrypt.hash(newPassword, 10),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
    ]);

    await this.refreshTokens.revokeAll(row.userId);

    await this.audit
      .recordInbound({
        action: 'auth.password-reset.completed',
        method: 'POST',
        path: '/auth/reset-password',
        entityType: 'user',
        entityId: row.userId,
        success: true,
        actor: { sub: row.userId, email: row.user.email, role: 'user' },
      })
      .catch(() => undefined);
  }

  private failureReason(
    row: { expiresAt: Date; usedAt: Date | null; user: { active: boolean } } | null,
  ): string | null {
    if (!row) return 'unknown_token';
    if (row.usedAt) return 'already_used';
    if (row.expiresAt < new Date()) return 'expired';
    if (!row.user.active) return 'disabled';
    return null;
  }
}
