import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { Branch, BranchCertificate, Merchant } from '@prisma/client';

import { RequestContextService } from '../audit/request-context.service';
import { eirmsConfig } from '../eirms/eirms.config';
import { PrismaService } from '../prisma/prisma.service';
import { VaultService } from '../vault/vault.service';
import {
  type CsrSubject,
  generateCsr,
  generateKeyPair,
  parseLeafCertificate,
  verifyLeafMatchesKey,
  verifySubjectCn,
} from './certificate-signer';
import { buildRequestFormDocx } from './docx-generator';
import { UpdateCertificateFormDto } from './dto/update-certificate-form.dto';
import { UploadCertificatePemDto } from './dto/upload-certificate.dto';

/**
 * Per-branch INSA certificate onboarding. Owned by MerchantsService for the
 * approval-time / branch-create hooks, and by the /branches/:id/certificate
 * controller for the merchant-admin wizard.
 *
 * Provisioning is idempotent: a second call for a branch that already has
 * material in Vault is a no-op. This lets us call `provisionForBranch` from
 * both the approval hook and the branch-create hook without race worries.
 */
export interface CertificateStatus {
  hasPrivateKey: boolean;
  hasCsr: boolean;
  hasCert: boolean;
  submittedAt: Date | null;
  issuedAt: Date | null;
  usedByo: boolean;
  cert: {
    subjectCn: string | null;
    serial: string | null;
    notBefore: Date | null;
    notAfter: Date | null;
  };
  form: {
    contactFullName: string | null;
    contactJobTitle: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    reason: string | null;
  };
  submissionEmail: string;
}

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: VaultService,
    private readonly context: RequestContextService,
    @Inject(eirmsConfig.KEY)
    private readonly config: ConfigType<typeof eirmsConfig>,
  ) {}

  // ---------------------------------------------------------------------------
  // Internal API: called from MerchantsService on approval + branch create.
  // ---------------------------------------------------------------------------

  /**
   * Ensure the branch has a signing keypair (in Vault) and a CSR + row (in
   * DB). Idempotent + self-healing across every partial state:
   *
   *   Vault key + DB row present        → no-op.
   *   Vault key present, DB row absent  → keep the key, regenerate the CSR,
   *                                       upsert the row. Catches the state
   *                                       where the original write partially
   *                                       succeeded.
   *   Vault key absent                  → generate a fresh keypair, derive a
   *                                       fresh CSR (the old CSR — if any —
   *                                       was signed with a key we've lost,
   *                                       so it's dead anyway), write both.
   *
   * Safe to call from the merchant-approval / branch-create hooks AND from
   * any wizard endpoint that would otherwise trip on missing state.
   */
  async provisionForBranch(merchantId: string, branchId: string): Promise<void> {
    const [existing, row] = await Promise.all([
      this.vault.readBranchSigning(merchantId, branchId),
      this.prisma.branchCertificate.findUnique({ where: { branchId } }),
    ]);
    if (existing?.privateKeyPem && row?.csrPem) {
      // Fully provisioned. No-op.
      return;
    }

    const { merchant, branch } = await this.loadForCsr(merchantId, branchId);
    if (!merchant.tin || merchant.tin === '__BOOTSTRAP__') {
      // The bootstrap sentinel row can't produce a real CSR — CN would be a
      // placeholder INSA would reject. Ops fills the TIN in via the seed
      // env vars; the next provision attempt then goes through.
      this.logger.warn(
        `Skipping cert provision for branch ${branchId}: merchant TIN not set yet.`,
      );
      return;
    }

    // Reuse the Vault key when it's there; only mint a new one when Vault
    // has nothing (or was previously unreachable during provision). The CSR
    // is always regenerated in the same call — that keeps it in lockstep
    // with whichever key ends up authoritative.
    const privateKeyPem =
      existing?.privateKeyPem ?? generateKeyPair().privateKeyPem;
    const csrPem = generateCsr(
      this.buildCsrSubject(merchant, branch),
      privateKeyPem,
    );

    await this.vault.writeBranchSigning(merchantId, branchId, {
      privateKeyPem,
      certPem: existing?.certPem ?? null,
    });
    await this.prisma.branchCertificate.upsert({
      where: { branchId },
      create: { branchId, csrPem },
      update: { csrPem },
    });
    this.logger.log(
      `Provisioned per-branch signing key + CSR for ${merchantId}/${branchId}.`,
    );
  }

  /**
   * Diagnostic: for every branch of the merchant, report what Vault + DB
   * think exists. Powers both the cert wizard's sibling explainer AND
   * troubleshooting the "hasCreds says yes but MoR says null" mismatch —
   * separates the SIGNING material (privateKey + cert) from the CREDENTIALS
   * (clientId + clientSecret + apikey), since they live at different Vault
   * paths and get truthful for different reasons.
   */
  async listMerchantCertificateState(merchantId: string): Promise<
    Array<{
      branchId: string;
      branchName: string;
      active: boolean;
      merchantTin: string;
      hasPrivateKey: boolean;
      hasCert: boolean;
      hasCsr: boolean;
      hasEirmsClientId: boolean;
      hasEirmsClientSecret: boolean;
      hasEirmsApikey: boolean;
      certSubjectCn: string | null;
      certNotAfter: Date | null;
    }>
  > {
    this.assertOwnMerchant(merchantId);
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { tin: true },
    });
    const branches = await this.prisma.branch.findMany({
      where: { merchantId },
      select: { id: true, name: true, active: true },
      orderBy: { name: 'asc' },
    });
    return Promise.all(
      branches.map(async (b) => {
        const [material, row, credFlags] = await Promise.all([
          this.vault.readBranchSigning(merchantId, b.id),
          this.prisma.branchCertificate.findUnique({ where: { branchId: b.id } }),
          this.vault.getBranchCredFlags(merchantId, b.id),
        ]);
        return {
          branchId: b.id,
          branchName: b.name,
          active: b.active,
          merchantTin: merchant?.tin ?? '',
          hasPrivateKey: !!material?.privateKeyPem,
          hasCert: !!material?.certPem,
          hasCsr: !!row?.csrPem,
          hasEirmsClientId: credFlags.clientId,
          hasEirmsClientSecret: credFlags.clientSecret,
          hasEirmsApikey: credFlags.apikey,
          certSubjectCn: row?.certSubjectCn ?? null,
          certNotAfter: row?.certNotAfter ?? null,
        };
      }),
    );
  }

  /** Provision every branch of a merchant. Called from the approval hook. */
  async provisionForMerchant(merchantId: string): Promise<void> {
    const branches = await this.prisma.branch.findMany({
      where: { merchantId },
      select: { id: true },
    });
    for (const b of branches) {
      try {
        await this.provisionForBranch(merchantId, b.id);
      } catch (err) {
        // Never block a merchant approval on a single branch's Vault hiccup —
        // the wizard will retry on next visit.
        this.logger.error(
          `Failed provisioning branch ${b.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Merchant-admin wizard endpoints.
  // ---------------------------------------------------------------------------

  async getStatus(
    merchantId: string,
    branchId: string,
  ): Promise<CertificateStatus> {
    this.assertOwnMerchant(merchantId);
    await this.assertBranchExists(merchantId, branchId);
    // Opening the wizard is the fallback trigger for merchants whose original
    // approval-time provisioning was lost (Vault outage, schema-migration gap,
    // ancient tenant approved before the cert feature). provisionForBranch is
    // idempotent so a second visit costs nothing.
    await this.provisionForBranch(merchantId, branchId);
    const [material, row] = await Promise.all([
      this.vault.readBranchSigning(merchantId, branchId),
      this.prisma.branchCertificate.findUnique({ where: { branchId } }),
    ]);
    return {
      hasPrivateKey: !!material?.privateKeyPem,
      hasCsr: !!row?.csrPem,
      hasCert: !!material?.certPem,
      submittedAt: row?.submittedAt ?? null,
      issuedAt: row?.issuedAt ?? null,
      usedByo: row?.usedByo ?? false,
      cert: {
        subjectCn: row?.certSubjectCn ?? null,
        serial: row?.certSerial ?? null,
        notBefore: row?.certNotBefore ?? null,
        notAfter: row?.certNotAfter ?? null,
      },
      form: {
        contactFullName: row?.contactFullName ?? null,
        contactJobTitle: row?.contactJobTitle ?? null,
        contactEmail: row?.contactEmail ?? null,
        contactPhone: row?.contactPhone ?? null,
        reason: row?.reason ?? null,
      },
      submissionEmail: this.config.certificateRequestEmail,
    };
  }

  async updateForm(
    merchantId: string,
    branchId: string,
    input: UpdateCertificateFormDto,
  ): Promise<CertificateStatus> {
    this.assertOwnMerchant(merchantId);
    const row = await this.ensureCertRow(merchantId, branchId);
    if (row.submittedAt) {
      throw new ConflictException(
        'The certificate request has already been submitted. Contact support to make changes.',
      );
    }
    await this.prisma.branchCertificate.update({
      where: { branchId },
      data: {
        contactFullName: normaliseInput(input.contactFullName),
        contactJobTitle: normaliseInput(input.contactJobTitle),
        contactEmail: normaliseInput(input.contactEmail),
        contactPhone: normaliseInput(input.contactPhone),
        reason: normaliseInput(input.reason),
      },
    });
    return this.getStatus(merchantId, branchId);
  }

  async markSubmitted(
    merchantId: string,
    branchId: string,
  ): Promise<CertificateStatus> {
    this.assertOwnMerchant(merchantId);
    const row = await this.ensureCertRow(merchantId, branchId);
    if (!row.csrPem) {
      // Self-heal covers the missing-row case; getting here means merchant TIN
      // was still the bootstrap sentinel at provision time. Point ops at the
      // fix instead of the raw "no CSR" wording.
      throw new BadRequestException(
        "Can't mark as sent — the merchant TIN is missing, so no CSR could be generated. Set the TIN on the merchant profile and reopen the wizard.",
      );
    }
    if (!row.submittedAt) {
      await this.prisma.branchCertificate.update({
        where: { branchId },
        data: { submittedAt: new Date() },
      });
    }
    return this.getStatus(merchantId, branchId);
  }

  async downloadCsr(
    merchantId: string,
    branchId: string,
  ): Promise<{ pem: string; filename: string }> {
    this.assertOwnMerchant(merchantId);
    const row = await this.ensureCertRow(merchantId, branchId);
    if (!row.csrPem) {
      throw new BadRequestException(
        "Can't download the CSR — the merchant TIN is missing, so no CSR could be generated. Set the TIN on the merchant profile and reopen the wizard.",
      );
    }
    return { pem: row.csrPem, filename: 'request.csr' };
  }

  async downloadRequestForm(
    merchantId: string,
    branchId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    this.assertOwnMerchant(merchantId);
    // Self-heal too — the DOCX is a fresh render every download, so the row
    // only matters for the editable form fields (contact + reason). Provision
    // ensures the row exists, then we pull whatever was typed.
    const row = await this.ensureCertRow(merchantId, branchId).catch(() => null);
    const { merchant, branch } = await this.loadForCsr(merchantId, branchId);
    const buffer = await buildRequestFormDocx({
      organization: {
        organizationName: merchant.legalName,
        // Prisma model doesn't carry CR number today — fall back to null and
        // let INSA hand-fill; if we grow a column later this reads it.
        commercialRegistrationNumber: null,
        tin: merchant.tin,
        subTin: branch.subTin,
        vatNumber: branch.vatNumber ?? merchant.vatNumber,
        registeredAddress: formatAddress(branch),
        city: branch.city ?? merchant.city,
        country: branch.country ?? 'ET',
      },
      contact: {
        fullName: row?.contactFullName ?? null,
        jobTitle: row?.contactJobTitle ?? null,
        email: row?.contactEmail ?? merchant.email ?? null,
        phone: row?.contactPhone ?? merchant.phone ?? null,
      },
      reason: row?.reason ?? null,
    });
    return { buffer, filename: 'CERTIFICATE REQUEST FORM.docx' };
  }

  /**
   * Verify + persist an INSA-issued PEM. Two paths:
   *
   * - Standard: `input.privateKeyPem` omitted. The leaf's public key must
   *   match the private key already in Vault.
   * - BYO: both fields provided. The supplied private key replaces whatever
   *   was in Vault, and the leaf is verified against that new key.
   *
   * In both paths, we also assert the CN equals the merchant TIN — this
   * catches the "uploaded the wrong branch's cert" mistake early.
   */
  async uploadPem(
    merchantId: string,
    branchId: string,
    input: UploadCertificatePemDto,
  ): Promise<CertificateStatus> {
    this.assertOwnMerchant(merchantId);
    const { merchant } = await this.loadForCsr(merchantId, branchId);
    const row = await this.prisma.branchCertificate.findUnique({
      where: { branchId },
    });

    const certPem = input.certPem?.trim();
    if (!certPem || !certPem.includes('-----BEGIN CERTIFICATE-----')) {
      throw new BadRequestException(
        'certPem must be a PEM-encoded certificate.',
      );
    }

    const byoKeyPem = input.privateKeyPem?.trim();
    const usedByo = !!byoKeyPem;
    let effectivePrivateKey: string;
    if (usedByo) {
      if (!byoKeyPem!.includes('-----BEGIN')) {
        throw new BadRequestException('privateKeyPem must be a PEM-encoded key.');
      }
      effectivePrivateKey = byoKeyPem!;
    } else {
      const existing = await this.vault.readBranchSigning(merchantId, branchId);
      if (!existing?.privateKeyPem) {
        throw new BadRequestException(
          'No private key on file for this branch. Regenerate the CSR first or upload with privateKeyPem for the BYO path.',
        );
      }
      effectivePrivateKey = existing.privateKeyPem;
    }

    let leaf;
    try {
      leaf = parseLeafCertificate(certPem);
    } catch (err) {
      throw new BadRequestException(
        `Certificate could not be parsed: ${(err as Error).message}`,
      );
    }
    let matches;
    try {
      matches = verifyLeafMatchesKey(certPem, effectivePrivateKey);
    } catch (err) {
      throw new BadRequestException(
        `Certificate / private key pair could not be verified: ${(err as Error).message}`,
      );
    }
    if (!matches) {
      throw new BadRequestException(
        usedByo
          ? "The uploaded certificate's public key does not match the uploaded private key."
          : "The uploaded certificate's public key does not match the CSR we generated. Make sure you're uploading the .pem INSA issued for this branch.",
      );
    }
    if (!verifySubjectCn(certPem, merchant.tin)) {
      throw new BadRequestException(
        `The certificate's Common Name does not match this merchant's TIN (${merchant.tin}).`,
      );
    }

    await this.vault.writeBranchSigning(merchantId, branchId, {
      privateKeyPem: effectivePrivateKey,
      certPem,
    });
    await this.prisma.branchCertificate.upsert({
      where: { branchId },
      create: {
        branchId,
        // CSR is unknown on the BYO path — the merchant already got their
        // cert from INSA without going through our CSR flow.
        csrPem: usedByo ? null : (row?.csrPem ?? null),
        issuedAt: new Date(),
        certSerial: leaf.serial,
        certSubjectCn: leaf.subjectCn,
        certNotBefore: leaf.notBefore,
        certNotAfter: leaf.notAfter,
        usedByo,
      },
      update: {
        issuedAt: new Date(),
        certSerial: leaf.serial,
        certSubjectCn: leaf.subjectCn,
        certNotBefore: leaf.notBefore,
        certNotAfter: leaf.notAfter,
        // If BYO overrides an earlier auto-generated CSR flow, mark it so
        // the audit trail explains why csrPem may not match reality.
        usedByo: usedByo || (row?.usedByo ?? false),
        // Ensure submittedAt is at least set — an operator uploading a PEM
        // implies the request went out.
        submittedAt: row?.submittedAt ?? new Date(),
      },
    });
    this.logger.log(
      `Accepted ${usedByo ? 'BYO ' : ''}INSA certificate for branch ${branchId} (CN=${leaf.subjectCn}, expires ${leaf.notAfter.toISOString()}).`,
    );
    return this.getStatus(merchantId, branchId);
  }

  // ---------------------------------------------------------------------------
  // Helpers.
  // ---------------------------------------------------------------------------

  private assertOwnMerchant(merchantId: string): void {
    const ctx = this.context.get();
    if (!ctx?.merchantId) return; // SUPER_ADMIN
    if (ctx.merchantId !== merchantId) {
      throw new ForbiddenException(
        "You can only manage your own merchant's certificates.",
      );
    }
  }

  private async assertBranchExists(
    merchantId: string,
    branchId: string,
  ): Promise<void> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { merchantId: true },
    });
    if (!branch || branch.merchantId !== merchantId) {
      throw new NotFoundException(`Branch ${branchId} not found.`);
    }
  }

  /**
   * Self-healing row fetch: kicks the (idempotent) provisioning path first,
   * then returns the row. Guarantees a row on success. Only throws when the
   * merchant TIN is still the bootstrap sentinel — provisioning is a no-op
   * there and the caller decides how to surface it.
   */
  private async ensureCertRow(
    merchantId: string,
    branchId: string,
  ): Promise<BranchCertificate> {
    await this.assertBranchExists(merchantId, branchId);
    await this.provisionForBranch(merchantId, branchId);
    const row = await this.prisma.branchCertificate.findUnique({
      where: { branchId },
    });
    if (!row) {
      // Provisioning skipped (bootstrap sentinel TIN). Point ops at the fix.
      throw new BadRequestException(
        "Can't set up the certificate — the merchant TIN is missing. Fill it in on the merchant profile and try again.",
      );
    }
    return row;
  }

  private async loadForCsr(
    merchantId: string,
    branchId: string,
  ): Promise<{ merchant: Merchant; branch: Branch }> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: { merchant: true },
    });
    if (!branch || branch.merchantId !== merchantId) {
      throw new NotFoundException(`Branch ${branchId} not found.`);
    }
    return { merchant: branch.merchant, branch };
  }

  private buildCsrSubject(merchant: Merchant, branch: Branch): CsrSubject {
    // The guide (§3.2) fixes ST/L to "Addis Ababa" and C to ET. We honour that
    // rather than derive from branch.region/city, so the CSR shape matches
    // what INSA's operators expect on the CA side.
    return {
      tin: merchant.tin,
      systemNumber: branch.systemNumber || branch.id,
      organizationName: merchant.legalName,
      organizationalUnitName: branch.name,
      country: 'ET',
      stateOrProvinceName: 'Addis Ababa',
      localityName: 'Addis Ababa',
      emailAddress:
        merchant.email?.trim() ||
        this.context.get()?.actorEmail ||
        'noreply@example.com',
    };
  }
}

/** Empty strings from HTML forms become "clear this field" in Prisma. */
function normaliseInput(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Best-effort "single-line address" for the DOCX form. */
function formatAddress(branch: Branch): string | null {
  const parts = [
    branch.houseNumber,
    branch.kebele && `Kebele ${branch.kebele}`,
    branch.wereda && `Wereda ${branch.wereda}`,
    branch.zone,
    branch.city,
    branch.region,
  ].filter((s): s is string => !!s && s.trim().length > 0);
  return parts.length === 0 ? null : parts.join(', ');
}
