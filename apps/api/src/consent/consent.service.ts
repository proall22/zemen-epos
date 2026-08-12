import { createHash, randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ConsentGrant, ConsentScope } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../audit/request-context.service';
import type { JwtPayload } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CONSENT_LINK_TTL_MINUTES,
  consentScopeLabels,
  isAllowedConsentMinutes,
} from './consent.constants';

const TOKEN_BYTES = 32;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Grant as returned to clients — never leaks the tokenHash. */
export type SafeConsentGrant = Omit<ConsentGrant, 'tokenHash'>;

function strip(grant: ConsentGrant): SafeConsentGrant {
  const { tokenHash: _tokenHash, ...rest } = grant;
  return rest;
}

@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ===========================================================================
  // Super-admin side
  // ===========================================================================

  /** A SUPER_ADMIN asks a merchant's admins for time-limited, scoped access.
   *  Creates a PENDING grant + magic-link token and emails the merchant admins. */
  async requestAccess(
    superAdminId: string,
    input: { merchantId: string; scopes: ConsentScope[]; proposedMinutes: number },
  ): Promise<SafeConsentGrant> {
    if (!isAllowedConsentMinutes(input.proposedMinutes)) {
      throw new BadRequestException('Unsupported access duration.');
    }
    if (!input.scopes || input.scopes.length === 0) {
      throw new BadRequestException('Pick at least one access scope.');
    }
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: input.merchantId },
      select: { id: true, legalName: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found.');

    const rawToken = randomBytes(TOKEN_BYTES).toString('hex');
    const grant = await this.prisma.consentGrant.create({
      data: {
        superAdminId,
        merchantId: merchant.id,
        scopes: input.scopes,
        proposedMinutes: input.proposedMinutes,
        tokenHash: hashToken(rawToken),
        linkExpiresAt: new Date(
          Date.now() + CONSENT_LINK_TTL_MINUTES * 60_000,
        ),
      },
    });

    await this.notifications.enqueue({
      action: 'consent.request',
      grantId: grant.id,
      rawToken,
    });

    await this.recordAudit(
      'consent.requested',
      grant.id,
      merchant.id,
      true,
      `scopes=${input.scopes.join(',')} minutes=${input.proposedMinutes}`,
    );
    return strip(grant);
  }

  /** The requesting super-admin's own grants, newest first. */
  async listMine(superAdminId: string): Promise<SafeConsentGrant[]> {
    await this.expireStale({ superAdminId });
    const grants = await this.prisma.consentGrant.findMany({
      where: { superAdminId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return grants.map(strip);
  }

  /** The single active (ACCEPTED, unexpired) grant for this super-admin into
   *  this merchant, if any. Used by the PermissionsGuard to elevate perms and
   *  by the interceptor to pin ctx.merchantId. Returns null when there's none. */
  async activeGrant(
    superAdminId: string,
    merchantId: string,
  ): Promise<{ id: string; scopes: ConsentScope[]; expiresAt: Date } | null> {
    const grant = await this.prisma.consentGrant.findFirst({
      where: {
        superAdminId,
        merchantId,
        status: 'ACCEPTED',
        expiresAt: { gt: new Date() },
      },
      orderBy: { expiresAt: 'desc' },
      select: { id: true, scopes: true, expiresAt: true },
    });
    if (!grant || !grant.expiresAt) return null;
    return { id: grant.id, scopes: grant.scopes, expiresAt: grant.expiresAt };
  }

  // ===========================================================================
  // Merchant-admin side (decision + oversight)
  // ===========================================================================

  /** Decision-page payload for the merchant admin who opened the magic link.
   *  Authorizes on MERCHANT_ADMIN membership of the grant's merchant — the
   *  token only identifies which grant. */
  async getForDecision(
    token: string,
    user: JwtPayload,
  ): Promise<SafeConsentGrant & { merchantName: string; requesterEmail: string }> {
    const grant = await this.loadByTokenForMerchantAdmin(token, user);
    const [merchant, requester] = await Promise.all([
      this.prisma.merchant.findUnique({
        where: { id: grant.merchantId },
        select: { legalName: true },
      }),
      this.prisma.user.findUnique({
        where: { id: grant.superAdminId },
        select: { email: true },
      }),
    ]);
    return {
      ...strip(grant),
      merchantName: merchant?.legalName ?? 'Unknown merchant',
      requesterEmail: requester?.email ?? 'unknown',
    };
  }

  /** Merchant admin accepts, choosing a window ≤ what was proposed. */
  async accept(
    token: string,
    user: JwtPayload,
    grantedMinutes: number,
  ): Promise<SafeConsentGrant> {
    const grant = await this.loadByTokenForMerchantAdmin(token, user);
    this.assertPending(grant);
    if (!isAllowedConsentMinutes(grantedMinutes)) {
      throw new BadRequestException('Unsupported access duration.');
    }
    if (grantedMinutes > grant.proposedMinutes) {
      throw new BadRequestException(
        'Granted duration cannot exceed what was requested.',
      );
    }
    const now = new Date();
    const updated = await this.prisma.consentGrant.update({
      where: { id: grant.id },
      data: {
        status: 'ACCEPTED',
        grantedMinutes,
        expiresAt: new Date(now.getTime() + grantedMinutes * 60_000),
        decidedByUserId: user.sub,
        decidedAt: now,
      },
    });
    await this.recordAudit(
      'consent.accepted',
      grant.id,
      grant.merchantId,
      true,
      `minutes=${grantedMinutes}`,
    );
    return strip(updated);
  }

  /** Merchant admin rejects the request. */
  async reject(token: string, user: JwtPayload): Promise<SafeConsentGrant> {
    const grant = await this.loadByTokenForMerchantAdmin(token, user);
    this.assertPending(grant);
    const updated = await this.prisma.consentGrant.update({
      where: { id: grant.id },
      data: {
        status: 'REJECTED',
        decidedByUserId: user.sub,
        decidedAt: new Date(),
      },
    });
    await this.recordAudit(
      'consent.rejected',
      grant.id,
      grant.merchantId,
      true,
    );
    return strip(updated);
  }

  /** Grants targeting the caller's merchant — the "who has platform access"
   *  list for a merchant admin. */
  async listForMerchant(user: JwtPayload): Promise<SafeConsentGrant[]> {
    if (user.role !== 'MERCHANT_ADMIN' || !user.merchantId) return [];
    await this.expireStale({ merchantId: user.merchantId });
    const grants = await this.prisma.consentGrant.findMany({
      where: { merchantId: user.merchantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return grants.map(strip);
  }

  /** Merchant admin cuts off an active (or pending) grant early. */
  async revoke(grantId: string, user: JwtPayload): Promise<SafeConsentGrant> {
    const grant = await this.prisma.consentGrant.findUnique({
      where: { id: grantId },
    });
    if (!grant) throw new NotFoundException('Grant not found.');
    if (!this.isMerchantAdminOf(user, grant.merchantId)) {
      throw new ForbiddenException('You cannot manage this grant.');
    }
    if (grant.status !== 'ACCEPTED' && grant.status !== 'PENDING') {
      throw new BadRequestException('This grant is not active.');
    }
    const updated = await this.prisma.consentGrant.update({
      where: { id: grant.id },
      data: {
        status: 'REVOKED',
        revokedByUserId: user.sub,
        revokedAt: new Date(),
      },
    });
    await this.recordAudit('consent.revoked', grant.id, grant.merchantId, true);
    return strip(updated);
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private async loadByTokenForMerchantAdmin(
    token: string,
    user: JwtPayload,
  ): Promise<ConsentGrant> {
    const grant = await this.prisma.consentGrant.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!grant) throw new NotFoundException('This access link is not valid.');
    if (!this.isMerchantAdminOf(user, grant.merchantId)) {
      // Don't reveal the grant to someone who isn't an admin of its merchant.
      throw new ForbiddenException(
        'You must be an administrator of this merchant to respond to the request.',
      );
    }
    return grant;
  }

  private isMerchantAdminOf(user: JwtPayload, merchantId: string): boolean {
    return user.role === 'MERCHANT_ADMIN' && user.merchantId === merchantId;
  }

  /** Flip ACCEPTED grants whose window has closed to EXPIRED so listings read
   *  true. Correctness of access itself never depends on this — the guard
   *  filters on `expiresAt > now` — but it keeps the UI honest. */
  private async expireStale(where: {
    superAdminId?: string;
    merchantId?: string;
  }): Promise<void> {
    await this.prisma.consentGrant
      .updateMany({
        where: { ...where, status: 'ACCEPTED', expiresAt: { lt: new Date() } },
        data: { status: 'EXPIRED' },
      })
      .catch(() => undefined);
  }

  private assertPending(grant: ConsentGrant): void {
    if (grant.status !== 'PENDING') {
      throw new BadRequestException(
        'This request has already been decided.',
      );
    }
    if (grant.linkExpiresAt < new Date()) {
      throw new BadRequestException('This access link has expired.');
    }
  }

  private async recordAudit(
    action: string,
    grantId: string,
    merchantId: string,
    success: boolean,
    detail?: string,
  ): Promise<void> {
    const ctx = this.context.get();
    await this.audit
      .recordInbound({
        action,
        method: 'POST',
        path: '/consent',
        entityType: 'consent_grant',
        entityId: grantId,
        success,
        errorMessage: detail,
        actor: ctx?.actorId
          ? {
              sub: ctx.actorId,
              email: ctx.actorEmail ?? '',
              role: ctx.actorRole ?? '',
            }
          : undefined,
      })
      .catch(() => undefined);
    // merchantId is captured on the audit row via request context when set;
    // logged here too for traceability of platform-side actions.
    this.logger.debug(`${action} grant=${grantId} merchant=${merchantId}`);
  }

  /** For email/UI copy — exposed so controllers can echo scope labels. */
  scopeLabels(scopes: ConsentScope[]): string[] {
    return consentScopeLabels(scopes);
  }
}
