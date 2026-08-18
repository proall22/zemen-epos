import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LegalDocumentStatus,
  Prisma,
  type Branch,
  type Merchant,
} from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

import { RequestContextService } from '../audit/request-context.service';
import { CertificatesService } from '../certificates/certificates.service';
import { EirmsSigningService } from '../eirms/eirms-signing.service';
import { EirmsAuthService } from '../eirms/eirms-auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TransactionalEmailService } from '../notifications/transactional-email.service';
import { PrismaService } from '../prisma/prisma.service';
import { VaultService } from '../vault/vault.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { RejectMerchantDto } from './dto/reject-merchant.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';

/** Stable ids for the seed merchant + branch created by the migration. After
 *  the bootstrap fills them from env, they're permanent records like any
 *  other — the env vars stop being the source of truth. */
export const DEFAULT_MERCHANT_ID = 'default-merchant';
export const DEFAULT_BRANCH_ID = 'default-branch';
const BOOTSTRAP_SENTINEL = '__BOOTSTRAP__';

/** The person behind a merchant signup — the earliest MERCHANT_ADMIN. */
export interface MerchantOwner {
  name: string | null;
  email: string;
  emailVerifiedAt: string | null;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export type MerchantWithOwner = Merchant & {
  owner: MerchantOwner | null;
  adminCount: number;
};

/** Back-office projection for the global branch approval queue. It contains
 *  review metadata only and never exposes EIRMS credentials. */
export interface PendingBranchReview {
  id: string;
  merchantId: string;
  merchantName: string;
  merchantTin: string;
  name: string;
  systemNumber: string;
  city: string | null;
  region: string | null;
  createdAt: string;
}

export interface RegistrationReview {
  merchantId: string;
  merchantName: string;
  tin: string;
  phone: string | null;
  registeredAt: string;
  applicant: {
    id: string;
    name: string | null;
    email: string;
    emailVerifiedAt: string | null;
    phone: string | null;
    phoneVerifiedAt: string | null;
  };
  document: {
    id: string;
    originalName: string;
    mediaType: string;
    sizeBytes: number;
    status: LegalDocumentStatus;
    uploadedAt: string;
    reviewedBy: string | null;
    reviewer: { name: string | null; email: string } | null;
    reviewedAt: string | null;
    rejectionReason: string | null;
  };
}

@Injectable()
export class MerchantsService implements OnModuleInit {
  private readonly logger = new Logger(MerchantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly context: RequestContextService,
    private readonly notifications: NotificationsService,
    private readonly transactionalEmail: TransactionalEmailService,
    private readonly vault: VaultService,
    private readonly certificates: CertificatesService,
    private readonly signing: EirmsSigningService,
    private readonly eirmsAuth: EirmsAuthService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.bootstrapDefault();
    } catch (err) {
      // Bootstrap failures must never block boot — log loudly so it's obvious
      // in CI/staging, but let the API start so unrelated routes keep working.
      this.logger.error(
        `Default merchant bootstrap failed: ${(err as Error).message}`,
      );
    }
    try {
      await this.seedConfiguredDefaultCredentials();
    } catch (err) {
      this.logger.error(
        `Configured default-branch credential seed failed: ${(err as Error).message}`,
      );
    }
    try {
      await this.backfillBranchCredsToVault();
    } catch (err) {
      this.logger.error(
        `Vault credentials backfill failed: ${(err as Error).message}`,
      );
    }
    try {
      // One-shot: if the platform-wide EIRMS_SIGNING_*_FILE env is still
      // pointing at PEMs on disk, seed them into Vault as the default
      // branch's signing material so the seed merchant keeps transacting
      // after the switch to per-branch signing.
      await this.signing.seedFromEnvIfMissing(
        DEFAULT_MERCHANT_ID,
        DEFAULT_BRANCH_ID,
      );
    } catch (err) {
      this.logger.error(
        `Default-branch signing seed failed: ${(err as Error).message}`,
      );
    }
  }

  /** Explicit operator-controlled seed for credentials issued to the system
   * owner. Secrets go directly to Vault and never to PostgreSQL. */
  private async seedConfiguredDefaultCredentials(): Promise<void> {
    if (this.config.get<string>('EIRMS_SEED_DEFAULT_CREDENTIALS') !== 'true') {
      return;
    }

    const clientId = this.config.get<string>('EIRMS_CLIENT_ID');
    const clientSecret = this.config.get<string>('EIRMS_CLIENT_SECRET');
    const apikey = this.config.get<string>('EIRMS_API_KEY');
    const tin = this.config.get<string>('EIRMS_TIN');
    const systemNumber = this.config.get<string>('EIRMS_SYSTEM_NUMBER');
    if (!clientId || !clientSecret || !apikey || !tin || !systemNumber) {
      throw new Error(
        'EIRMS default credential seed is enabled, but one or more required EIRMS values are missing.',
      );
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id: DEFAULT_BRANCH_ID },
      select: { merchantId: true },
    });
    if (!branch || branch.merchantId !== DEFAULT_MERCHANT_ID) {
      throw new Error(
        'The default system-owner branch does not exist. Assign these credentials to the intended branch through the Super Admin branch form.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.merchant.update({
        where: { id: DEFAULT_MERCHANT_ID },
        data: {
          tin,
          legalName:
            this.config.get<string>('EIRMS_SELLER_LEGAL_NAME') ?? undefined,
        },
      }),
      this.prisma.branch.update({
        where: { id: DEFAULT_BRANCH_ID },
        data: { systemNumber },
      }),
    ]);
    await this.vault.writeBranchCreds(DEFAULT_MERCHANT_ID, DEFAULT_BRANCH_ID, {
      clientId,
      clientSecret,
      apikey,
    });
    this.logger.log(
      `Seeded configured EIRMS identity and Vault credentials for ${DEFAULT_MERCHANT_ID}/${DEFAULT_BRANCH_ID}.`,
    );
  }

  async testBranchEirmsConnection(
    merchantId: string,
    branchId: string,
  ): Promise<{
    ok: true;
    tin: string;
    systemType: string;
    systemNumber: string;
  }> {
    this.assertOwnMerchant(merchantId);
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, merchantId },
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found for this merchant.');
    }
    return this.eirmsAuth.testConnection(branchId);
  }

  /** Legacy-only: fills the seed merchant + branch from env when a legacy
   *  install still has the sentinel row. Fresh installs never create the row
   *  in the first place, so this is a no-op there — silent, not warning. */
  private async bootstrapDefault(): Promise<void> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: DEFAULT_MERCHANT_ID },
    });
    if (!merchant) {
      // Fresh install — the multi-tenant seed row simply doesn't exist and
      // that's fine. Real merchants come in via signup / admin-create.
      return;
    }
    if (merchant.tin !== BOOTSTRAP_SENTINEL) {
      // Already bootstrapped (or admin set it up directly). Nothing to do.
      return;
    }

    const tin = this.config.get<string>('EIRMS_TIN');
    if (!tin) {
      // Legacy sentinel row without env TIN — leave it alone rather than
      // stamp a placeholder. The switcher hides it once real branches exist
      // for the signed-in user, so no user impact.
      this.logger.debug(
        'Legacy default-merchant row is still the sentinel; EIRMS_TIN unset — skipping bootstrap fill.',
      );
      return;
    }

    await this.prisma.merchant.update({
      where: { id: DEFAULT_MERCHANT_ID },
      data: {
        tin,
        legalName: this.config.get<string>('EIRMS_SELLER_LEGAL_NAME') ?? '',
        email: this.config.get<string>('EIRMS_SELLER_EMAIL') ?? null,
        phone: this.config.get<string>('EIRMS_SELLER_PHONE') ?? null,
        vatNumber: this.config.get<string>('EIRMS_SELLER_VAT_NUMBER') ?? null,
        region: this.config.get<string>('EIRMS_SELLER_REGION') ?? null,
        wereda: this.config.get<string>('EIRMS_SELLER_WEREDA') ?? null,
      },
    });

    await this.prisma.branch.update({
      where: { id: DEFAULT_BRANCH_ID },
      data: {
        name: 'Main',
        systemNumber:
          this.config.get<string>('EIRMS_SYSTEM_NUMBER')?.trim() ?? '',
        region: this.config.get<string>('EIRMS_SELLER_REGION') ?? null,
        wereda: this.config.get<string>('EIRMS_SELLER_WEREDA') ?? null,
      },
    });

    // Env-loaded EIRMS creds go straight to Vault — the DB columns are
    // deprecated. Skipping gracefully if any field is missing lets a
    // partially-configured dev env still boot; `EirmsAuthService.login`
    // will surface the missing-cred error on first use.
    const envClientId = this.config.get<string>('EIRMS_CLIENT_ID');
    const envClientSecret = this.config.get<string>('EIRMS_CLIENT_SECRET');
    const envApikey = this.config.get<string>('EIRMS_API_KEY');
    if (envClientId && envClientSecret && envApikey) {
      try {
        await this.vault.writeBranchCreds(
          DEFAULT_MERCHANT_ID,
          DEFAULT_BRANCH_ID,
          {
            clientId: envClientId,
            clientSecret: envClientSecret,
            apikey: envApikey,
          },
        );
      } catch (err) {
        this.logger.warn(
          `Could not seed default-branch EIRMS creds into Vault (${(err as Error).message}); EirmsAuthService will fail until this is resolved.`,
        );
      }
    }

    this.logger.log(
      'Bootstrapped default merchant + branch from env. ' +
        'These records are now the source of truth; env vars are bootstrap-only.',
    );
  }

  /**
   * One-shot migration: any branch row that still has plaintext EIRMS creds
   * in its DB columns gets them copied into Vault and the columns nulled.
   * Idempotent — already-empty rows are skipped. Per-branch errors don't
   * stop the rest from migrating, so a single broken branch can't pin the
   * whole platform in a half-migrated state.
   */
  private async backfillBranchCredsToVault(): Promise<void> {
    const branches = await this.prisma.branch.findMany({
      where: {
        OR: [
          { eirmsClientId: { not: null } },
          { eirmsClientSecret: { not: null } },
          { eirmsApikey: { not: null } },
        ],
      },
      select: {
        id: true,
        merchantId: true,
        eirmsClientId: true,
        eirmsClientSecret: true,
        eirmsApikey: true,
      },
    });
    if (branches.length === 0) return;
    this.logger.log(
      `Migrating EIRMS creds from DB → Vault for ${branches.length} branch(es).`,
    );
    for (const branch of branches) {
      try {
        // Only write a full triplet — partial DB rows shouldn't pollute Vault.
        if (
          branch.eirmsClientId &&
          branch.eirmsClientSecret &&
          branch.eirmsApikey
        ) {
          await this.vault.writeBranchCreds(branch.merchantId, branch.id, {
            clientId: branch.eirmsClientId,
            clientSecret: branch.eirmsClientSecret,
            apikey: branch.eirmsApikey,
          });
        }
        await this.prisma.branch.update({
          where: { id: branch.id },
          data: {
            eirmsClientId: null,
            eirmsClientSecret: null,
            eirmsApikey: null,
          },
        });
      } catch (err) {
        this.logger.error(
          `Failed migrating EIRMS creds for branch ${branch.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  // ===========================================================================
  // Onboarding API — Phase D. SUPER_ADMIN can manage every merchant + branch;
  // merchant admins (ACCOUNTANT/SUPPORT) can manage only their own merchant's
  // branches. The scope check is centralised in {@link assertOwnMerchant}.
  // ===========================================================================

  async list(): Promise<MerchantWithOwner[]> {
    // SUPER_ADMIN (no merchantId in ctx) sees all; merchant admins see only
    // their own row. We filter rather than fan out via guard so the API stays
    // honest if someone bypasses the controller.
    const ctx = this.context.get();
    const merchants = await this.prisma.merchant.findMany({
      where: ctx?.merchantId ? { id: ctx.merchantId } : undefined,
      orderBy: [{ active: 'desc' }, { legalName: 'asc' }],
    });
    return this.withOwners(merchants);
  }

  async get(id: string): Promise<MerchantWithOwner> {
    this.assertOwnMerchant(id);
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundException(`Merchant ${id} not found`);
    const [enriched] = await this.withOwners([merchant]);
    return enriched;
  }

  async listRegistrationReviews(
    status?: LegalDocumentStatus,
  ): Promise<RegistrationReview[]> {
    this.assertBackOfficeReviewer();
    if (status && !Object.values(LegalDocumentStatus).includes(status)) {
      throw new BadRequestException('Invalid legal document status.');
    }
    const documents = await this.prisma.merchantLegalDocument.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        merchant: {
          select: { legalName: true, tin: true, phone: true, createdAt: true },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            emailVerifiedAt: true,
            phone: true,
            phoneVerifiedAt: true,
          },
        },
        reviewer: { select: { name: true, email: true } },
      },
    });
    return documents.map((d) => this.toRegistrationReview(d));
  }

  async getRegistrationReview(merchantId: string): Promise<RegistrationReview> {
    const ctx = this.context.get();
    if (ctx?.actorRole !== 'SUPER_ADMIN' && ctx?.merchantId !== merchantId) {
      throw new ForbiddenException('You cannot view this registration.');
    }
    const document = await this.prisma.merchantLegalDocument.findFirst({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      include: {
        merchant: {
          select: { legalName: true, tin: true, phone: true, createdAt: true },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            emailVerifiedAt: true,
            phone: true,
            phoneVerifiedAt: true,
          },
        },
        reviewer: { select: { name: true, email: true } },
      },
    });
    if (!document)
      throw new NotFoundException('Registration document not found.');
    return this.toRegistrationReview(document);
  }

  async openRegistrationDocument(merchantId: string): Promise<{
    bytes: Buffer;
    mediaType: string;
    filename: string;
  }> {
    this.assertBackOfficeReviewer();
    const document = await this.prisma.merchantLegalDocument.findFirst({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
    });
    if (!document)
      throw new NotFoundException('Registration document not found.');
    // storageKey is server-generated and unique. basename is a second
    // fail-closed boundary in case a database row is ever corrupted.
    if (basename(document.storageKey) !== document.storageKey) {
      throw new NotFoundException('Registration document not found.');
    }
    const directory = this.config.get<string>(
      'authVerification.legalDocumentDirectory',
      '/var/lib/zemen/legal-documents',
    );
    const bytes = await readFile(join(directory, document.storageKey)).catch(
      () => {
        throw new NotFoundException(
          'Registration document file is unavailable.',
        );
      },
    );
    return {
      bytes,
      mediaType: document.mediaType,
      filename: basename(document.originalName),
    };
  }

  async replaceRejectedRegistrationDocument(
    merchantId: string,
    file: { buffer: Buffer; originalname: string; size: number },
  ): Promise<RegistrationReview> {
    const ctx = this.context.get();
    if (
      !ctx?.actorId ||
      ctx.merchantId !== merchantId ||
      ctx.actorRole !== 'MERCHANT_ADMIN'
    ) {
      throw new ForbiddenException(
        'Only the merchant owner can replace this document.',
      );
    }
    const latest = await this.prisma.merchantLegalDocument.findFirst({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });
    if (!latest || latest.status !== 'REJECTED') {
      throw new ConflictException(
        'A replacement is allowed only after document rejection.',
      );
    }
    const validated = this.validateLegalDocument(file);
    const directory = this.config.get<string>(
      'authVerification.legalDocumentDirectory',
      '/var/lib/zemen/legal-documents',
    );
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const storageKey = `${randomUUID()}${validated.extension}`;
    await writeFile(join(directory, storageKey), file.buffer, {
      flag: 'wx',
      mode: 0o600,
    });
    await this.prisma.merchantLegalDocument.create({
      data: {
        merchantId,
        userId: ctx.actorId,
        storageKey,
        originalName:
          basename(file.originalname)
            .normalize('NFKC')
            .replace(/[^a-zA-Z0-9._ -]/g, '_')
            .slice(0, 180) || 'document',
        mediaType: validated.mediaType,
        sizeBytes: file.size,
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
      },
    });
    return this.getRegistrationReview(merchantId);
  }

  private validateLegalDocument(file: { buffer: Buffer; size: number }): {
    extension: string;
    mediaType: string;
  } {
    const maxBytes = this.config.get<number>(
      'authVerification.legalDocumentMaxBytes',
      5 * 1024 * 1024,
    );
    if (!file.buffer.length || file.size > maxBytes) {
      throw new BadRequestException(
        'Legal document must be no larger than 5 MB.',
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

  private assertBackOfficeReviewer(): void {
    if (this.context.get()?.actorRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Only the back-office can review registrations.',
      );
    }
  }

  private toRegistrationReview(d: any): RegistrationReview {
    return {
      merchantId: d.merchantId,
      merchantName: d.merchant.legalName,
      tin: d.merchant.tin,
      phone: d.merchant.phone,
      registeredAt: d.merchant.createdAt.toISOString(),
      applicant: {
        ...d.user,
        emailVerifiedAt: d.user.emailVerifiedAt?.toISOString() ?? null,
        phoneVerifiedAt: d.user.phoneVerifiedAt?.toISOString() ?? null,
      },
      document: {
        id: d.id,
        originalName: d.originalName,
        mediaType: d.mediaType,
        sizeBytes: d.sizeBytes,
        status: d.status,
        uploadedAt: d.createdAt.toISOString(),
        reviewedBy: d.reviewedBy,
        reviewer: d.reviewer,
        reviewedAt: d.reviewedAt?.toISOString() ?? null,
        rejectionReason: d.rejectionReason,
      },
    };
  }

  /**
   * Attach each merchant's owner (earliest MERCHANT_ADMIN) + admin count, so
   * the super-admin's Merchant Management view can vet the person behind a
   * signup when approving/rejecting — without a per-row round trip.
   */
  private async withOwners(
    merchants: Merchant[],
  ): Promise<MerchantWithOwner[]> {
    if (merchants.length === 0) return [];
    const ids = merchants.map((m) => m.id);
    const admins = await this.prisma.user.findMany({
      where: { merchantId: { in: ids }, role: 'MERCHANT_ADMIN' },
      orderBy: { createdAt: 'asc' },
      select: {
        merchantId: true,
        name: true,
        email: true,
        emailVerifiedAt: true,
        active: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });
    const ownerByMerchant = new Map<string, MerchantOwner>();
    const adminCount = new Map<string, number>();
    for (const a of admins) {
      if (!a.merchantId) continue;
      adminCount.set(a.merchantId, (adminCount.get(a.merchantId) ?? 0) + 1);
      if (!ownerByMerchant.has(a.merchantId)) {
        ownerByMerchant.set(a.merchantId, {
          name: a.name,
          email: a.email,
          emailVerifiedAt: a.emailVerifiedAt
            ? a.emailVerifiedAt.toISOString()
            : null,
          active: a.active,
          createdAt: a.createdAt.toISOString(),
          lastLoginAt: a.lastLoginAt ? a.lastLoginAt.toISOString() : null,
        });
      }
    }
    return merchants.map((m) => ({
      ...m,
      owner: ownerByMerchant.get(m.id) ?? null,
      adminCount: adminCount.get(m.id) ?? 0,
    }));
  }

  async create(input: CreateMerchantDto): Promise<Merchant> {
    const ctx = this.context.get();
    try {
      const created = await this.prisma.merchant.create({
        data: {
          legalName: input.legalName.trim(),
          tradeName: input.tradeName?.trim() || null,
          tin: input.tin.trim(),
          email: input.email?.trim() || null,
          phone: input.phone?.trim() || null,
          vatNumber: input.vatNumber?.trim() || null,
          city: input.city?.trim() || null,
          region: input.region?.trim() || null,
          zone: input.zone?.trim() || null,
          wereda: input.wereda?.trim() || null,
          kebele: input.kebele?.trim() || null,
          houseNumber: input.houseNumber?.trim() || null,
          // This endpoint is back-office only. Merchants created here do not
          // need to wait in the self-signup approval queue.
          active: true,
          approvedAt: new Date(),
          approvedBy: ctx?.actorId ?? null,
        },
      });
      if (created.email) {
        void this.transactionalEmail.notify({
          type: 'MERCHANT_CREATED',
          to: created.email,
          merchantName: created.legalName,
        });
      }
      return created;
    } catch (err) {
      // TIN is the only global unique on merchants — turn the raw P2002 into
      // a 409 that says exactly which constraint tripped.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('A merchant with that TIN already exists.');
      }
      throw err;
    }
  }

  async update(id: string, input: UpdateMerchantDto): Promise<Merchant> {
    this.assertOwnMerchant(id);
    const existing = await this.get(id); // 404 if missing
    const ctx = this.context.get();
    // Only SUPER_ADMIN may toggle a merchant's active flag — otherwise a
    // pending merchant admin could approve themselves by submitting
    // `active: true` to the same update endpoint they use for edits.
    const isSuperAdmin = ctx?.actorRole === 'SUPER_ADMIN';
    const activeOverride = isSuperAdmin ? input.active : undefined;
    // First activation = approval. Stamp approvedAt + the super-admin who did
    // it, then keep both forever (a later disable doesn't reset them — we
    // still want to know they were once approved).
    const isFirstApproval =
      activeOverride === true && existing.approvedAt === null;
    if (isFirstApproval) {
      const pendingDocument = await this.prisma.merchantLegalDocument.findFirst(
        {
          where: { merchantId: id, status: 'PENDING' },
          select: { id: true },
        },
      );
      if (!pendingDocument) {
        throw new ConflictException(
          'A pending legal registration document is required before approval.',
        );
      }
    }
    // Enable / disable transitions on an already-approved merchant. Distinct
    // from first-approval (which has its own email + approvedAt stamp).
    const isEnable =
      activeOverride === true &&
      existing.approvedAt !== null &&
      !existing.active;
    const isDisable =
      activeOverride === false &&
      existing.approvedAt !== null &&
      existing.active;
    try {
      const updated = await this.prisma.merchant.update({
        where: { id },
        data: {
          // legalName is non-null on the schema; refuse to blank it.
          legalName:
            input.legalName === undefined ? undefined : input.legalName.trim(),
          tradeName:
            input.tradeName === undefined
              ? undefined
              : input.tradeName?.trim() || null,
          tin: input.tin === undefined ? undefined : input.tin.trim(),
          email:
            input.email === undefined ? undefined : input.email?.trim() || null,
          phone:
            input.phone === undefined ? undefined : input.phone?.trim() || null,
          vatNumber:
            input.vatNumber === undefined
              ? undefined
              : input.vatNumber?.trim() || null,
          city:
            input.city === undefined ? undefined : input.city?.trim() || null,
          region:
            input.region === undefined
              ? undefined
              : input.region?.trim() || null,
          zone:
            input.zone === undefined ? undefined : input.zone?.trim() || null,
          wereda:
            input.wereda === undefined
              ? undefined
              : input.wereda?.trim() || null,
          kebele:
            input.kebele === undefined
              ? undefined
              : input.kebele?.trim() || null,
          houseNumber:
            input.houseNumber === undefined
              ? undefined
              : input.houseNumber?.trim() || null,
          active: activeOverride,
          ...(isFirstApproval
            ? {
                approvedAt: new Date(),
                approvedBy: ctx?.actorId ?? null,
                // Approving a previously-rejected merchant voids the
                // rejection — clear the trail so /merchants reflects the
                // current state.
                rejectedAt: null,
                rejectedBy: null,
                rejectionReason: null,
              }
            : {}),
        },
      });
      if (isFirstApproval) {
        await this.prisma.merchantLegalDocument.updateMany({
          where: { merchantId: updated.id, status: 'PENDING' },
          data: {
            status: 'APPROVED',
            reviewedAt: new Date(),
            reviewedBy: ctx?.actorId ?? null,
            rejectionReason: null,
          },
        });
        // The branch submitted with self-registration is part of the same
        // review decision as the merchant. This also safely covers any old
        // pending signup rows created before branch approval was introduced.
        await this.prisma.branch.updateMany({
          where: {
            merchantId: updated.id,
            approvedAt: null,
            rejectedAt: null,
          },
          data: {
            active: true,
            approvedAt: new Date(),
            approvedBy: ctx?.actorId ?? null,
          },
        });
        // Approval is the trigger for per-branch INSA cert onboarding. Fire
        // and forget — a Vault hiccup here must not roll back the approval,
        // and the wizard will retry on the merchant admin's next visit.
        void this.certificates
          .provisionForMerchant(updated.id)
          .catch((err: Error) =>
            this.logger.error(
              `Post-approval cert provisioning failed for merchant ${updated.id}: ${err.message}`,
            ),
          );
        void this.notifications.enqueue({
          action: 'merchant.approved',
          merchantId: updated.id,
        });
        const recipient = existing.owner?.email ?? updated.email;
        if (recipient) {
          void this.transactionalEmail.notify({
            type: 'REGISTRATION_APPROVED',
            to: recipient,
            name: existing.owner?.name ?? null,
            merchantName: updated.legalName,
            occurredAt: new Date(),
          });
        }
      } else if (isEnable) {
        void this.notifications.enqueue({
          action: 'merchant.enabled',
          merchantId: updated.id,
        });
      } else if (isDisable) {
        void this.notifications.enqueue({
          action: 'merchant.disabled',
          merchantId: updated.id,
        });
      }
      if (isSuperAdmin && !isFirstApproval) {
        const changedFields = merchantChangedFields(existing, input);
        const recipient = existing.owner?.email ?? updated.email;
        if (recipient && changedFields.length > 0) {
          void this.transactionalEmail.notify({
            type: 'ACCOUNT_UPDATED',
            to: recipient,
            name: existing.owner?.name ?? null,
            changedFields,
          });
        }
      }
      return updated;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('A merchant with that TIN already exists.');
      }
      throw err;
    }
  }

  /**
   * Reject a pending merchant signup. Only valid for merchants that haven't
   * been approved yet — once approved, the right knob is enable/disable, not
   * reject. SUPER_ADMIN only. The reason (optional) is stored + included in
   * the rejection email.
   */
  async reject(id: string, input: RejectMerchantDto): Promise<Merchant> {
    const ctx = this.context.get();
    if (ctx?.actorRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Only the back-office can reject merchants.',
      );
    }
    const existing = await this.get(id);
    if (existing.approvedAt) {
      throw new ConflictException(
        'This merchant was already approved. Disable it instead of rejecting.',
      );
    }
    if (existing.rejectedAt) {
      throw new ConflictException('This merchant is already rejected.');
    }
    const updated = await this.prisma.merchant.update({
      where: { id },
      data: {
        active: false,
        rejectedAt: new Date(),
        rejectedBy: ctx?.actorId ?? null,
        rejectionReason: input.reason.trim(),
      },
    });
    await this.prisma.merchantLegalDocument.updateMany({
      where: { merchantId: updated.id, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        reviewedAt: new Date(),
        reviewedBy: ctx?.actorId ?? null,
        rejectionReason: input.reason.trim(),
      },
    });
    void this.notifications.enqueue({
      action: 'merchant.rejected',
      merchantId: updated.id,
    });
    return updated;
  }

  // ----- Branches ------------------------------------------------------------

  async listPendingBranchReviews(): Promise<PendingBranchReview[]> {
    const ctx = this.context.get();
    if (ctx?.actorRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Only the back-office can review pending branches.',
      );
    }
    const rows = await this.prisma.branch.findMany({
      where: {
        approvedAt: null,
        rejectedAt: null,
        merchant: { approvedAt: { not: null }, active: true },
      },
      orderBy: { createdAt: 'asc' },
      include: { merchant: { select: { legalName: true, tin: true } } },
    });
    return rows.map((branch) => ({
      id: branch.id,
      merchantId: branch.merchantId,
      merchantName: branch.merchant.legalName,
      merchantTin: branch.merchant.tin,
      name: branch.name,
      systemNumber: branch.systemNumber,
      city: branch.city,
      region: branch.region,
      createdAt: branch.createdAt.toISOString(),
    }));
  }

  async branchStats(
    merchantId: string,
    branchId: string,
  ): Promise<{
    invoices: number;
    receipts: number;
    activeUsers: number;
    lastActivityAt: Date | null;
  }> {
    this.assertOwnMerchant(merchantId);
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, merchantId },
      select: { id: true },
    });
    if (!branch) throw new NotFoundException(`Branch ${branchId} not found.`);
    const [invoices, receipts, activeUsers, lastInvoice, lastReceipt] =
      await Promise.all([
        this.prisma.invoice.count({ where: { branchId } }),
        this.prisma.receipt.count({ where: { branchId } }),
        this.prisma.userBranch.count({
          where: { branchId, user: { active: true } },
        }),
        this.prisma.invoice.findFirst({
          where: { branchId },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        this.prisma.receipt.findFirst({
          where: { branchId },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
      ]);
    const ts = [lastInvoice?.createdAt, lastReceipt?.createdAt]
      .filter((d): d is Date => d instanceof Date)
      .map((d) => d.getTime());
    const lastActivityAt = ts.length ? new Date(Math.max(...ts)) : null;
    return { invoices, receipts, activeUsers, lastActivityAt };
  }

  async listBranches(merchantId: string): Promise<Branch[]> {
    this.assertOwnMerchant(merchantId);
    await this.get(merchantId); // 404 if merchant missing
    return this.prisma.branch.findMany({
      where: { merchantId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  /** Idempotent: creates the branch's `Main` sales-floor store if it has none.
   *  Safe to call on an existing branch. */
  async ensureDefaultStore(
    merchantId: string,
    branchId: string,
  ): Promise<void> {
    const existing = await this.prisma.store.findFirst({
      where: { branchId },
      select: { id: true },
    });
    if (existing) return;
    await this.prisma.store.create({
      data: {
        merchantId,
        branchId,
        name: 'Main',
        code: 'MAIN',
        isDefault: true,
        isSalesFloor: true,
      },
    });
  }

  async createBranch(
    merchantId: string,
    input: CreateBranchDto,
  ): Promise<Branch> {
    this.assertOwnMerchant(merchantId);
    await this.get(merchantId); // 404 if merchant missing
    const ctx = this.context.get();
    const createdBySuperAdmin = ctx?.actorRole === 'SUPER_ADMIN';
    let branch: Branch;
    try {
      branch = await this.prisma.branch.create({
        data: {
          merchant: { connect: { id: merchantId } },
          name: input.name.trim(),
          systemNumber: input.systemNumber?.trim() ?? '',
          city: input.city?.trim() || null,
          region: input.region?.trim() || null,
          zone: input.zone?.trim() || null,
          wereda: input.wereda?.trim() || null,
          kebele: input.kebele?.trim() || null,
          houseNumber: input.houseNumber?.trim() || null,
          subTin: input.subTin?.trim() || null,
          tradeName: input.tradeName?.trim() || null,
          vatNumber: input.vatNumber?.trim() || null,
          country: input.country?.trim() || null,
          stockPolicy: input.stockPolicy ?? undefined,
          // EIRMS creds live in Vault — never in these columns. Left null
          // here even when the DTO carries values; the Vault write below is
          // the single source of truth.
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          // Tenant-created additional branches wait for Super Admin review.
          // A back-office-created branch is approved as part of creation.
          active: createdBySuperAdmin,
          approvedAt: createdBySuperAdmin ? new Date() : null,
          approvedBy: createdBySuperAdmin ? (ctx?.actorId ?? null) : null,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'A branch with that system number already exists for this merchant.',
        );
      }
      throw err;
    }
    await this.ensureDefaultStore(merchantId, branch.id);
    await this.persistBranchCreds(merchantId, branch.id, {
      clientId: input.eirmsClientId,
      clientSecret: input.eirmsClientSecret,
      apikey: input.eirmsApikey,
    });
    // Only provision cert material once the parent merchant is approved —
    // otherwise the CSR would carry a not-yet-live TIN, and INSA would
    // reject anything issued off it. The approval hook fills backfills for
    // any branch created while the merchant was still pending.
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { approvedAt: true, active: true },
    });
    if (merchant?.approvedAt && merchant.active && branch.approvedAt) {
      void this.certificates
        .provisionForBranch(merchantId, branch.id)
        .catch((err: Error) =>
          this.logger.error(
            `Post-branch-create cert provisioning failed for ${merchantId}/${branch.id}: ${err.message}`,
          ),
        );
    }
    return branch;
  }

  async approveBranch(merchantId: string, branchId: string): Promise<Branch> {
    const ctx = this.context.get();
    if (ctx?.actorRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Only the back-office can approve branches.',
      );
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, merchantId },
    });
    if (!branch) throw new NotFoundException(`Branch ${branchId} not found.`);
    if (branch.approvedAt)
      throw new ConflictException('This branch is already approved.');
    const updated = await this.prisma.branch.update({
      where: { id: branchId },
      data: {
        active: true,
        approvedAt: new Date(),
        approvedBy: ctx.actorId ?? null,
        rejectedAt: null,
        rejectedBy: null,
        rejectionReason: null,
      },
    });
    void this.certificates
      .provisionForBranch(merchantId, branchId)
      .catch((err: Error) =>
        this.logger.error(
          `Post-branch-approval cert provisioning failed for ${merchantId}/${branchId}: ${err.message}`,
        ),
      );
    return updated;
  }

  async rejectBranch(
    merchantId: string,
    branchId: string,
    input: RejectMerchantDto,
  ): Promise<Branch> {
    const ctx = this.context.get();
    if (ctx?.actorRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only the back-office can reject branches.');
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, merchantId },
    });
    if (!branch) throw new NotFoundException(`Branch ${branchId} not found.`);
    if (branch.approvedAt)
      throw new ConflictException(
        'This branch was already approved. Disable it instead.',
      );
    if (branch.rejectedAt)
      throw new ConflictException('This branch is already rejected.');
    return this.prisma.branch.update({
      where: { id: branchId },
      data: {
        active: false,
        rejectedAt: new Date(),
        rejectedBy: ctx.actorId ?? null,
        rejectionReason: input.reason?.trim() || null,
      },
    });
  }

  async updateBranch(
    merchantId: string,
    branchId: string,
    input: UpdateBranchDto,
  ): Promise<Branch> {
    this.assertOwnMerchant(merchantId);
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch || branch.merchantId !== merchantId) {
      throw new NotFoundException(`Branch ${branchId} not found`);
    }
    const ctx = this.context.get();
    // Approval is never inferred from the generic active toggle. Tenant
    // admins may edit onboarding details while pending, but only back-office
    // can enable/disable an already-approved branch.
    const activeOverride =
      ctx?.actorRole === 'SUPER_ADMIN' && branch.approvedAt
        ? input.active
        : undefined;
    let updated: Branch;
    try {
      updated = await this.prisma.branch.update({
        where: { id: branchId },
        data: {
          name: input.name === undefined ? undefined : input.name.trim(),
          systemNumber:
            input.systemNumber === undefined
              ? undefined
              : input.systemNumber.trim(),
          city:
            input.city === undefined ? undefined : input.city?.trim() || null,
          region:
            input.region === undefined
              ? undefined
              : input.region?.trim() || null,
          zone:
            input.zone === undefined ? undefined : input.zone?.trim() || null,
          wereda:
            input.wereda === undefined
              ? undefined
              : input.wereda?.trim() || null,
          kebele:
            input.kebele === undefined
              ? undefined
              : input.kebele?.trim() || null,
          houseNumber:
            input.houseNumber === undefined
              ? undefined
              : input.houseNumber?.trim() || null,
          subTin:
            input.subTin === undefined
              ? undefined
              : input.subTin?.trim() || null,
          tradeName:
            input.tradeName === undefined
              ? undefined
              : input.tradeName?.trim() || null,
          vatNumber:
            input.vatNumber === undefined
              ? undefined
              : input.vatNumber?.trim() || null,
          country:
            input.country === undefined
              ? undefined
              : input.country?.trim() || null,
          stockPolicy: input.stockPolicy,
          // EIRMS creds are persisted in Vault below — these columns stay
          // null. They're kept on the schema only for the brief migration
          // window and will be dropped in a follow-up migration.
          active: activeOverride,
          // Geo-pin: undefined = unchanged; null = explicit clear; number =
          // new value. The DTO already validates the range.
          latitude: input.latitude === undefined ? undefined : input.latitude,
          longitude:
            input.longitude === undefined ? undefined : input.longitude,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'A branch with that system number already exists for this merchant.',
        );
      }
      throw err;
    }
    await this.persistBranchCreds(merchantId, branchId, {
      clientId: input.eirmsClientId,
      clientSecret: input.eirmsClientSecret,
      apikey: input.eirmsApikey,
    });
    return updated;
  }

  /**
   * Write EIRMS creds for a branch to Vault, observing partial-update
   * semantics:
   *   undefined        — leave the field as-is in Vault
   *   "" (empty string) — clear that field; if all three become empty, soft-
   *                       delete the whole secret instead of storing blanks
   *   "value"          — set the field
   *
   * The trim-then-null logic that used to live inline on each branch route is
   * centralised here so create and update behave identically.
   */
  private async persistBranchCreds(
    merchantId: string,
    branchId: string,
    input: {
      clientId?: string;
      clientSecret?: string;
      apikey?: string;
    },
  ): Promise<void> {
    const touched =
      input.clientId !== undefined ||
      input.clientSecret !== undefined ||
      input.apikey !== undefined;
    if (!touched) return;
    const current = await this.vault.readBranchCreds(merchantId, branchId);
    const merged = {
      clientId:
        input.clientId === undefined
          ? (current?.clientId ?? '')
          : input.clientId.trim(),
      clientSecret:
        input.clientSecret === undefined
          ? (current?.clientSecret ?? '')
          : input.clientSecret.trim(),
      apikey:
        input.apikey === undefined
          ? (current?.apikey ?? '')
          : input.apikey.trim(),
    };
    if (!merged.clientId && !merged.clientSecret && !merged.apikey) {
      // Caller cleared every field — drop the secret instead of storing the
      // blank triplet, so EirmsAuthService.readBranchCreds returns null and
      // we surface "not configured" cleanly.
      await this.vault.deleteBranchCreds(merchantId, branchId);
      return;
    }
    await this.vault.writeBranchCreds(merchantId, branchId, merged);
  }

  /** Boolean flags per cred field for the controller's response. Looks up
   *  the secret in Vault — see {@link VaultService.getBranchCredFlags} for
   *  the unreachable-Vault behaviour (returns all-false + logs). */
  getBranchCredFlags(
    merchantId: string,
    branchId: string,
  ): Promise<{ clientId: boolean; clientSecret: boolean; apikey: boolean }> {
    return this.vault.getBranchCredFlags(merchantId, branchId);
  }

  /** Signing material lives in Vault, not the branch row, so readiness can't
   *  be derived from the DB alone. Unreachable Vault reads as "not set up"
   *  rather than throwing — the panel is advisory. */
  async getBranchSigningFlags(
    merchantId: string,
    branchId: string,
  ): Promise<{ hasSigningKey: boolean; hasCert: boolean }> {
    try {
      const material = await this.vault.readBranchSigning(merchantId, branchId);
      return {
        hasSigningKey: !!material?.privateKeyPem,
        hasCert: !!material?.certPem,
      };
    } catch {
      return { hasSigningKey: false, hasCert: false };
    }
  }

  /** Throws 403 if a merchant-scoped actor is trying to act on a different
   *  merchant. SUPER_ADMIN (no merchantId in ctx) always passes. */
  private assertOwnMerchant(merchantId: string): void {
    const ctx = this.context.get();
    if (!ctx?.merchantId) return; // SUPER_ADMIN or system
    if (ctx.merchantId !== merchantId) {
      throw new ForbiddenException(
        "You can only manage your own merchant's records.",
      );
    }
  }

  /**
   * Refuse high-risk actions (invoice / receipt creation) while the merchant
   * is still pending super-admin approval. Reads + onboarding edits stay
   * allowed — the merchant admin needs to be able to fix typos and add EIRMS
   * credentials while waiting. Throws a clear 403 the SPA can surface.
   */
  async assertMerchantActive(merchantId: string): Promise<void> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { active: true, approvedAt: true, rejectedAt: true },
    });
    if (!merchant) {
      throw new NotFoundException(`Merchant ${merchantId} not found.`);
    }
    if (!merchant.active) {
      if (merchant.rejectedAt) {
        throw new ForbiddenException(
          'Your merchant account was not approved. Check your email for details, or contact support to appeal.',
        );
      }
      throw new ForbiddenException(
        merchant.approvedAt
          ? 'This merchant is disabled. Contact support to re-enable it.'
          : 'Your merchant account is awaiting approval. You can edit your details and EIRMS credentials in the meantime.',
      );
    }
  }
}

function merchantChangedFields(
  existing: MerchantWithOwner,
  input: UpdateMerchantDto,
): string[] {
  const fields: Array<[keyof UpdateMerchantDto, keyof Merchant, string]> = [
    ['legalName', 'legalName', 'Business name'],
    ['tradeName', 'tradeName', 'Trade name'],
    ['tin', 'tin', 'TIN'],
    ['email', 'email', 'Business email'],
    ['phone', 'phone', 'Phone number'],
    ['vatNumber', 'vatNumber', 'VAT number'],
    ['city', 'city', 'City'],
    ['region', 'region', 'Region'],
    ['zone', 'zone', 'Zone'],
    ['wereda', 'wereda', 'Wereda'],
    ['kebele', 'kebele', 'Kebele'],
    ['houseNumber', 'houseNumber', 'House number'],
  ];
  return fields
    .filter(([inputKey, modelKey]) => {
      const value = input[inputKey];
      if (value === undefined) return false;
      const normalized =
        typeof value === 'string' ? value.trim() || null : value;
      return normalized !== existing[modelKey];
    })
    .map(([, , label]) => label);
}
