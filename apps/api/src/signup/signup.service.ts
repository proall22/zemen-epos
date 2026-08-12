import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import type { IssuedSession } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { SignupMerchantDto } from './dto/signup-merchant.dto';

// The previous in-process per-IP rate limit has been replaced by the global
// @nestjs/throttler (Redis-backed, shared across replicas) plus the per-route
// 3-per-hour throttle on SignupController. See apps/api/src/security.

@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  async signupMerchant(input: SignupMerchantDto): Promise<IssuedSession> {
    const ownerEmail = input.owner.email.toLowerCase().trim();
    const tin = input.merchant.tin.trim();
    const branchName = input.branch?.name?.trim() || 'Main';

    // No pre-flight uniqueness check. The earlier version returned a separate
    // 409 for "email taken" vs. "TIN taken", which let an unauthenticated
    // caller enumerate every account email and every merchant TIN on the
    // platform — both PII. We let the DB's unique constraint raise P2002 and
    // collapse it to one generic message below, so callers can't tell which
    // field collided. The /signup/merchant route is rate-limited at 3/h/IP
    // (see SignupController) so brute-forcing the collision is impractical.

    const passwordHash = await bcrypt.hash(input.owner.password, 10);

    let userId: string;
    let merchantId: string;
    let branchId: string;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const merchant = await tx.merchant.create({
          data: {
            legalName: input.merchant.legalName.trim(),
            tradeName: input.merchant.tradeName?.trim() || null,
            tin,
            email: input.merchant.email?.trim() || null,
            phone: input.merchant.phone?.trim() || null,
            vatNumber: input.merchant.vatNumber?.trim() || null,
            city: input.merchant.city?.trim() || null,
            region: input.merchant.region?.trim() || null,
            zone: input.merchant.zone?.trim() || null,
            wereda: input.merchant.wereda?.trim() || null,
            kebele: input.merchant.kebele?.trim() || null,
            houseNumber: input.merchant.houseNumber?.trim() || null,
            // Lands pending — schema default is also false, but be explicit.
            active: false,
            approvedAt: null,
          },
        });
        const branch = await tx.branch.create({
          data: {
            merchant: { connect: { id: merchant.id } },
            name: branchName,
            latitude: input.branch?.latitude ?? null,
            longitude: input.branch?.longitude ?? null,
          },
        });
        // Stock has to land somewhere — without this every inventory write at
        // the new tenant's first branch fails with "no active stores".
        await tx.store.create({
          data: {
            merchantId: merchant.id,
            branchId: branch.id,
            name: 'Main',
            code: 'MAIN',
            isDefault: true,
            isSalesFloor: true,
          },
        });
        const user = await tx.user.create({
          data: {
            email: ownerEmail,
            passwordHash,
            name: input.owner.name?.trim() || null,
            // The signup owner is the tenant administrator: they manage their
            // merchant + branches (incl. EIRMS credential rotation) and invite
            // their team (ACCOUNTANT / CASHIER / SUPPORT). Stays merchant-wide
            // (branchId=null) so they span every branch they add.
            role: 'MERCHANT_ADMIN',
            merchantId: merchant.id,
            branchId: null,
          },
        });
        return { merchant, branch, user };
      });
      userId = result.user.id;
      merchantId = result.merchant.id;
      branchId = result.branch.id;
    } catch (err) {
      // Collapse any uniqueness collision (Merchant.tin or User.email) to one
      // generic message — never reveal which of the two collided, so a
      // probing attacker can't enumerate either field. The route rate-limit
      // (3/h/IP) further bounds the probe rate.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Log the actual collision target so operators can still debug
        // legitimate duplicate-signup support requests.
        this.logger.warn(
          `Signup collision (P2002) on ${JSON.stringify(err.meta?.target)} — surfaced as generic 4xx.`,
        );
        throw new ConflictException(
          "We couldn't process your application. If you believe this is a mistake, please contact support.",
        );
      }
      throw err;
    }

    this.logger.log(
      `Merchant signup: ${input.merchant.legalName} (TIN ${tin}) — pending approval. Owner ${ownerEmail}.`,
    );

    await this.audit.recordInbound({
      action: 'auth.signup',
      method: 'POST',
      path: '/signup/merchant',
      entityType: 'merchant',
      entityId: merchantId,
      success: true,
      actor: { sub: userId, email: ownerEmail, role: 'MERCHANT_ADMIN' },
    });

    // Welcome email — queued, so a notifications-disabled deployment is a
    // no-op and a transient Redis hiccup never breaks signup.
    void this.notifications.enqueue({
      action: 'merchant.signup',
      merchantId,
    });

    // Stamp last-login best-effort so the user shows up as "currently
    // active" in admin reports right away.
    void this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    }).catch(() => {
      /* signup must not fail on bookkeeping */
    });

    // Reuse AuthService.issueSession so the access-token / refresh-token
    // pair, TTLs, and tracker keys stay in lock-step with the login flow.
    return this.auth.issueSession({
      id: userId,
      email: ownerEmail,
      name: input.owner.name?.trim() || null,
      role: 'MERCHANT_ADMIN',
      merchantId,
      branchId: null,
      language: 'en',
    });
  }
}
