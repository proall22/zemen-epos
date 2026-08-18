import { readFile } from 'node:fs/promises';
import { X509Certificate } from 'node:crypto';

import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { VaultService } from '../vault/vault.service';
import { type SigningMaterial, signEnvelope } from './eirms-signer';

/** How long a per-branch material is trusted before we re-read Vault. Short
 *  enough that a cert rotation is picked up within one window without an app
 *  restart; long enough that the signing hot path doesn't hit Vault on every
 *  request. */
const MATERIAL_TTL_MS = 5 * 60 * 1000;

interface CachedMaterial {
  material: SigningMaterial;
  expiresAt: number;
}

/**
 * Per-branch EIRMS request signer. The private key + INSA-issued certificate
 * live in Vault under `m-<merchantId>/data/branches/<branchId>/signing`,
 * populated by the certificate onboarding wizard. Callers pass the branch
 * context; we cache the material for a short window so the signing hot path
 * doesn't hit Vault every call.
 *
 * There is NO platform-wide fallback: every branch must complete cert
 * onboarding before it can transact. The one exception is a one-shot boot
 * backfill — if EIRMS_SIGNING_*_FILE env vars point at platform PEMs and the
 * default merchant's default branch has no material yet, we seed it there so
 * the pre-multi-tenancy install keeps working. See seedDefaultBranchIfNeeded.
 */
@Injectable()
export class EirmsSigningService implements OnModuleInit {
  private readonly logger = new Logger(EirmsSigningService.name);
  private readonly cache = new Map<string, CachedMaterial>();
  private readonly inFlight = new Map<string, Promise<SigningMaterial>>();

  constructor(
    private readonly config: ConfigService,
    private readonly vault: VaultService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Log-only sanity check that the misconfiguration (exactly one of the
    // pair) doesn't slip through — the actual backfill is triggered from
    // MerchantsService.onModuleInit so it runs after the default-merchant
    // bootstrap. That decouples this service from the merchant lifecycle.
    const keyFile = this.config.get<string>('EIRMS_SIGNING_PRIVATE_KEY_FILE');
    const certFile = this.config.get<string>('EIRMS_SIGNING_CERT_FILE');
    if (!!keyFile !== !!certFile) {
      this.logger.warn(
        'EIRMS_SIGNING_PRIVATE_KEY_FILE and EIRMS_SIGNING_CERT_FILE must both be set (or neither). The one-shot default-branch backfill will be skipped.',
      );
    }
  }

  /**
   * Wrap `body` in the signed envelope MoR requires. Reads the per-branch
   * material from Vault (cached). Throws 503 if the branch has no cert on
   * file — the SPA surfaces this as "complete cert onboarding" copy.
   */
  async wrap(
    body: unknown,
    tenant: { merchantId: string; branchId: string },
  ): Promise<unknown> {
    const material = await this.materialFor(tenant);
    return signEnvelope(body, material);
  }

  isHttps(): boolean {
    const url = this.config.get<string>('EIRMS_BASE_URL') ?? '';
    return url.startsWith('https://');
  }

  /** Read+cache material for one branch. Refuses if the private key or the
   *  cert is missing — half-provisioned branches can't sign. */
  private async materialFor(tenant: {
    merchantId: string;
    branchId: string;
  }): Promise<SigningMaterial> {
    const key = `${tenant.merchantId}:${tenant.branchId}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.material;
    }
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const load = this.loadMaterial(tenant).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, load);
    return load;
  }

  private async loadMaterial(tenant: {
    merchantId: string;
    branchId: string;
  }): Promise<SigningMaterial> {
    // Each branch operates on its own credentials + certificate — clientId,
    // apikey and the INSA leaf are all issued per-branch by MoR, so a sibling
    // branch's cert is NOT interchangeable at the operational level. If this
    // branch has nothing, we refuse; the wizard link tells the operator
    // exactly which branch to complete.
    const stored = await this.vault.readBranchSigning(
      tenant.merchantId,
      tenant.branchId,
    );
    if (!stored?.privateKeyPem || !stored?.certPem) {
      const missing: string[] = [];
      if (!stored?.privateKeyPem) missing.push('signing key');
      if (!stored?.certPem) missing.push('INSA certificate');
      throw new ServiceUnavailableException({
        message: `This branch cannot sign MoR requests yet — missing ${missing.join(' and ')}.`,
        userMessages: [
          `This branch is missing ${missing.join(' and ')} required to sign requests to MoR.`,
          'A merchant admin needs to open the branch certificate wizard and finish onboarding.',
        ],
        reasonCode: 'BRANCH_NOT_READY',
        reasonMissing: missing,
      });
    }
    let certificate: X509Certificate;
    try {
      certificate = new X509Certificate(stored.certPem);
    } catch {
      throw new ServiceUnavailableException({
        message: 'This branch has an invalid INSA certificate.',
        userMessages: [
          'The installed INSA certificate cannot be read.',
          'A merchant admin must upload the correct PEM certificate in the branch certificate wizard.',
        ],
        reasonCode: 'CERTIFICATE_INVALID',
      });
    }
    const now = Date.now();
    const validFrom = new Date(certificate.validFrom).getTime();
    const validTo = new Date(certificate.validTo).getTime();
    if (validFrom > now) {
      throw new ServiceUnavailableException({
        message: 'This branch certificate is not valid yet.',
        userMessages: [
          `The installed INSA certificate becomes valid on ${new Date(validFrom).toISOString()}.`,
          'Check the server clock or upload the correct certificate.',
        ],
        reasonCode: 'CERTIFICATE_NOT_YET_VALID',
      });
    }
    if (validTo <= now) {
      throw new ServiceUnavailableException({
        message: 'This branch certificate has expired.',
        userMessages: [
          `The installed INSA certificate expired on ${new Date(validTo).toISOString()}.`,
          'A merchant admin must complete certificate renewal before sending more MoR requests.',
        ],
        reasonCode: 'CERTIFICATE_EXPIRED',
      });
    }
    const material: SigningMaterial = {
      privateKeyPem: stored.privateKeyPem,
      certificateFile: stored.certPem,
    };
    this.cache.set(`${tenant.merchantId}:${tenant.branchId}`, {
      material,
      expiresAt: Date.now() + MATERIAL_TTL_MS,
    });
    return material;
  }

  /** Force the next `wrap` for a branch to re-read Vault. Called from the
   *  certificate onboarding endpoint after a fresh PEM is accepted so the
   *  first invoice after upload doesn't sign with the now-stale cached
   *  material (which was probably the "no cert" 503 anyway). */
  invalidate(tenant: { merchantId: string; branchId: string }): void {
    this.cache.delete(`${tenant.merchantId}:${tenant.branchId}`);
  }

  /**
   * One-shot migration: if a platform-wide cert was configured via env and
   * `<merchantId>/<branchId>` has no Vault material yet, copy the env files
   * into Vault. Called from MerchantsService.onModuleInit for the seed
   * merchant/branch pair. Idempotent (a second call with material already in
   * Vault is a no-op).
   */
  async seedFromEnvIfMissing(
    merchantId: string,
    branchId: string,
  ): Promise<void> {
    const keyFile = this.config.get<string>('EIRMS_SIGNING_PRIVATE_KEY_FILE');
    const certFile = this.config.get<string>('EIRMS_SIGNING_CERT_FILE');
    if (!keyFile || !certFile) return;

    const existing = await this.vault.readBranchSigning(merchantId, branchId);
    if (existing?.privateKeyPem && existing?.certPem) return;

    try {
      const [privateKeyPem, certPem] = await Promise.all([
        readFile(keyFile, 'utf-8'),
        readFile(certFile, 'utf-8'),
      ]);
      // Sign a probe payload with the loaded key + cert to catch a broken
      // pairing before invoicing does.
      signEnvelope(
        { probe: true },
        { privateKeyPem, certificateFile: certPem },
      );
      await this.vault.writeBranchSigning(merchantId, branchId, {
        privateKeyPem,
        certPem,
      });
      this.logger.log(
        `Seeded env-configured EIRMS signing material into Vault for ${merchantId}/${branchId}.`,
      );
    } catch (err) {
      this.logger.error(
        `Env → Vault signing backfill for ${merchantId}/${branchId} failed: ${(err as Error).message}`,
      );
    }
  }
}
