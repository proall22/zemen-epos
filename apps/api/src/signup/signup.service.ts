import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Prisma, type User } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { AuditService } from '../audit/audit.service';
import type { PendingAuthResponse } from '../auth/auth.types';
import { authVerificationConfig } from '../auth/auth-verification.config';
import { maskEmail, OtpService } from '../auth/otp.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TransactionalEmailService } from '../notifications/transactional-email.service';
import { PrismaService } from '../prisma/prisma.service';
import type { SignupMerchantDto } from './dto/signup-merchant.dto';

interface SignupDocument {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

interface GoogleSignupIdentity {
  googleSubject: string;
  email: string;
  name: string | null;
}

// The previous in-process per-IP rate limit has been replaced by the global
// @nestjs/throttler (Redis-backed, shared across replicas) plus the per-route
// 3-per-hour throttle on SignupController. See apps/api/src/security.

@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly otp: OtpService,
    private readonly audit: AuditService,
    private readonly transactionalEmail: TransactionalEmailService,
    @Inject(authVerificationConfig.KEY)
    private readonly config: ConfigType<typeof authVerificationConfig>,
  ) {}

  async signupMerchant(
    input: SignupMerchantDto,
    document: SignupDocument,
  ): Promise<PendingAuthResponse> {
    return this.createMerchantSignup(input, document);
  }

  async signupMerchantWithGoogle(
    input: SignupMerchantDto,
    document: SignupDocument,
    identity: GoogleSignupIdentity,
  ): Promise<User> {
    return this.createMerchantSignup(input, document, identity);
  }

  private createMerchantSignup(
    input: SignupMerchantDto,
    document: SignupDocument,
  ): Promise<PendingAuthResponse>;
  private createMerchantSignup(
    input: SignupMerchantDto,
    document: SignupDocument,
    googleIdentity: GoogleSignupIdentity,
  ): Promise<User>;
  private async createMerchantSignup(
    input: SignupMerchantDto,
    document: SignupDocument,
    googleIdentity?: GoogleSignupIdentity,
  ): Promise<PendingAuthResponse | User> {
    const file = this.validateDocument(document);
    const ownerEmail = (googleIdentity?.email ?? input.owner.email)
      .toLowerCase()
      .trim();
    const tin = input.merchant.tin.trim();
    const branchName = input.branch?.name?.trim() || 'Main';

    // No pre-flight uniqueness check. The earlier version returned a separate
    // 409 for "email taken" vs. "TIN taken", which let an unauthenticated
    // caller enumerate every account email and every merchant TIN on the
    // platform — both PII. We let the DB's unique constraint raise P2002 and
    // collapse it to one generic message below, so callers can't tell which
    // field collided. The /signup/merchant route is rate-limited at 3/h/IP
    // (see SignupController) so brute-forcing the collision is impractical.

    const passwordHash = await bcrypt.hash(
      googleIdentity ? `${randomUUID()}${randomUUID()}` : input.owner.password,
      10,
    );

    let userId: string;
    let merchantId: string;
    let storedPath: string | null = null;
    try {
      await mkdir(this.config.legalDocumentDirectory, {
        recursive: true,
        mode: 0o700,
      });
      const storageKey = `${randomUUID()}${file.extension}`;
      storedPath = join(this.config.legalDocumentDirectory, storageKey);
      await writeFile(storedPath, document.buffer, { flag: 'wx', mode: 0o600 });
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
            active: false,
            approvedAt: null,
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
            name: googleIdentity?.name ?? input.owner.name?.trim() ?? null,
            // The signup owner is the tenant administrator: they manage their
            // merchant + branches (incl. EIRMS credential rotation) and invite
            // their team (ACCOUNTANT / CASHIER / SUPPORT). Stays merchant-wide
            // (branchId=null) so they span every branch they add.
            role: 'MERCHANT_ADMIN',
            merchantId: merchant.id,
            branchId: null,
            phone: input.merchant.phone?.trim() || null,
            googleSubject: googleIdentity?.googleSubject,
            emailVerifiedAt: googleIdentity ? new Date() : undefined,
          },
        });
        await tx.merchantLegalDocument.create({
          data: {
            merchantId: merchant.id,
            userId: user.id,
            storageKey,
            originalName: this.sanitizeFilename(document.originalname),
            mediaType: file.mediaType,
            sizeBytes: document.size,
            sha256: createHash('sha256').update(document.buffer).digest('hex'),
          },
        });
        return { merchant, branch, user };
      });
      userId = result.user.id;
      merchantId = result.merchant.id;
    } catch (err) {
      // Collapse any uniqueness collision (Merchant.tin or User.email) to one
      // generic message — never reveal which of the two collided, so a
      // probing attacker can't enumerate either field. The route rate-limit
      // (3/h/IP) further bounds the probe rate.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        if (storedPath) await unlink(storedPath).catch(() => undefined);
        // Log the actual collision target so operators can still debug
        // legitimate duplicate-signup support requests.
        this.logger.warn(
          `Signup collision (P2002) on ${JSON.stringify(err.meta?.target)} — surfaced as generic 4xx.`,
        );
        throw new ConflictException(
          'An account or business with these details may already exist. Try signing in with the owner email, or contact support if you need help.',
        );
      }
      if (storedPath) await unlink(storedPath).catch(() => undefined);
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
    if (this.config.registrationReviewEmail) {
      void this.transactionalEmail.notify({
        type: 'REGISTRATION_SUBMITTED',
        to: this.config.registrationReviewEmail,
        applicantName: input.owner.name?.trim() || ownerEmail,
        applicantEmail: ownerEmail,
        merchantName: input.merchant.legalName.trim(),
        occurredAt: new Date(),
      });
    }

    if (googleIdentity) {
      return this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    }

    const pendingToken = this.otp.pendingToken(userId, 'email-verification');
    let deliveryFailed = false;
    try {
      await this.otp.sendEmailVerification(userId);
    } catch (err) {
      // Account creation is already committed. Preserve the pending state so
      // the user can retry delivery instead of receiving a false signup
      // failure and then colliding with their newly-created account.
      deliveryFailed = true;
      this.logger.warn(
        `Initial verification delivery failed for newly-created user ${userId}: ${(err as Error).name}`,
      );
    }
    return {
      step: 'email-verification',
      pendingToken,
      email: maskEmail(ownerEmail),
      phone: null,
      deliveryFailed,
    };
  }

  private validateDocument(file: { buffer: Buffer; size: number }): {
    extension: string;
    mediaType: string;
  } {
    if (!file.buffer.length || file.size > this.config.legalDocumentMaxBytes) {
      throw new BadRequestException(
        `Legal document must be no larger than ${Math.floor(this.config.legalDocumentMaxBytes / 1024 / 1024)} MB.`,
      );
    }
    const b = file.buffer;
    if (b.subarray(0, 5).toString() === '%PDF-')
      return { extension: '.pdf', mediaType: 'application/pdf' };
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
      return { extension: '.jpg', mediaType: 'image/jpeg' };
    if (
      b
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    )
      return { extension: '.png', mediaType: 'image/png' };
    throw new BadRequestException(
      'Legal document must be a genuine PDF, JPEG, or PNG file.',
    );
  }

  private sanitizeFilename(name: string): string {
    return (
      basename(name)
        .normalize('NFKC')
        .replace(/[^a-zA-Z0-9._ -]/g, '_')
        .slice(0, 180) || 'document'
    );
  }
}
