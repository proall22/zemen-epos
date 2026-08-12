import { HttpService } from '@nestjs/axios';
import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { AuditService } from '../audit/audit.service';
import { eirmsAction } from '../audit/eirms-action';
import { RequestContextService } from '../audit/request-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { VaultService } from '../vault/vault.service';
import { eirmsConfig } from './eirms.config';
import {
  EirmsEnvelope,
  EirmsTokenResponse,
  SystemIdentity,
} from './eirms-auth.types';
import { EirmsSigningService } from './eirms-signing.service';

const REFRESH_GRACE_SECONDS = 60;

interface JwtClaims {
  systemType?: string;
  systemNumber?: string;
  tin?: string;
  preferred_username?: string;
  exp?: number;
}

interface CachedToken {
  accessToken: string;
  refreshToken: string;
  encryptionKey: string | null;
  expiresAt: number;
  claims: JwtClaims;
  /** Tenant this token belongs to. Threaded through so the refresh path can
   *  sign its own request without a second branch → merchant lookup. */
  tenant: { merchantId: string; branchId: string };
}

/**
 * Per-branch EIRMS token cache. Each branch has its own MOR account + system
 * number + sequence stream, so we key the token cache by branch — a request
 * from branch A and one from branch B trigger two logins, one each, and
 * subsequent requests from the same branch hit the cache.
 *
 * Callers normally don't pass `branchId` directly — it's read from the
 * request context (the cashier's branch). The argument is exposed for the
 * occasional case where we want to authenticate against a specific branch
 * without a request (e.g. tests).
 */
@Injectable()
export class EirmsAuthService {
  private readonly logger = new Logger(EirmsAuthService.name);
  private readonly cachedByBranch = new Map<string, CachedToken>();
  private readonly inFlight = new Map<string, Promise<CachedToken>>();

  constructor(
    @Inject(eirmsConfig.KEY)
    private readonly config: ConfigType<typeof eirmsConfig>,
    private readonly http: HttpService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly vault: VaultService,
    private readonly signing: EirmsSigningService,
  ) {}

  async getAccessToken(branchId?: string): Promise<string> {
    return (await this.ensureToken(this.resolveBranch(branchId))).accessToken;
  }

  async getEncryptionKey(branchId?: string): Promise<string | null> {
    return (await this.ensureToken(this.resolveBranch(branchId))).encryptionKey;
  }

  /**
   * System identity stamped onto outgoing payloads — for the resolved branch.
   * Reads from the cached JWT claims (which carry the TIN + system number that
   * MOR assigned for that branch's account). Returns env-shape defaults when
   * the token isn't cached yet (test-time before any call has succeeded).
   */
  getSystemIdentity(branchId?: string): SystemIdentity {
    const resolved = this.tryResolveBranch(branchId);
    const claims = resolved ? this.cachedByBranch.get(resolved)?.claims : null;
    return {
      tin: claims?.tin ?? this.config.tin,
      systemType: (claims?.systemType as 'POS') ?? 'POS',
      systemNumber: claims?.systemNumber ?? '',
      clientId: claims?.preferred_username ?? this.config.clientId,
    };
  }

  /** Required branch resolution — throws if neither argument nor context gives one. */
  private resolveBranch(branchId?: string): string {
    const resolved = this.tryResolveBranch(branchId);
    if (!resolved) {
      throw new ServiceUnavailableException(
        'No branch context available for EIRMS authentication.',
      );
    }
    return resolved;
  }

  /** Best-effort: returns null if no branch is available (read paths). */
  private tryResolveBranch(branchId?: string): string | null {
    if (branchId) return branchId;
    return this.context.get()?.branchId ?? null;
  }

  private async ensureToken(branchId: string): Promise<CachedToken> {
    const cached = this.cachedByBranch.get(branchId);
    if (cached && !this.isExpiring(cached)) return cached;
    const pending = this.inFlight.get(branchId);
    if (pending) return pending;
    const next = this.acquireToken(branchId).finally(() => {
      this.inFlight.delete(branchId);
    });
    this.inFlight.set(branchId, next);
    return next;
  }

  private async acquireToken(branchId: string): Promise<CachedToken> {
    const prev = this.cachedByBranch.get(branchId);
    if (prev?.refreshToken) {
      try {
        const refreshed = await this.refresh(prev);
        this.cachedByBranch.set(branchId, refreshed);
        return refreshed;
      } catch (err) {
        this.logger.warn(
          `EIRMS refresh failed for branch ${branchId} (${(err as Error).message}); falling back to fresh login.`,
        );
      }
    }
    const fresh = await this.login(branchId);
    this.cachedByBranch.set(branchId, fresh);
    return fresh;
  }

  private async login(branchId: string): Promise<CachedToken> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: { merchant: true },
    });
    if (!branch) {
      throw new ServiceUnavailableException({
        message: `Branch ${branchId} not found.`,
        userMessages: ['That branch no longer exists. Ask a merchant admin.'],
        reasonCode: 'BRANCH_NOT_FOUND',
      });
    }
    if (!branch.merchant.tin || branch.merchant.tin === '__BOOTSTRAP__') {
      throw new ServiceUnavailableException({
        message: 'Merchant TIN is not set.',
        userMessages: [
          "This merchant hasn't set its TIN yet. Update the merchant profile before invoicing.",
        ],
        reasonCode: 'MERCHANT_TIN_MISSING',
      });
    }
    const creds = await this.vault.readBranchCreds(branch.merchantId, branchId);
    if (!creds) {
      throw new ServiceUnavailableException({
        message: `This branch has no EIRMS credentials configured.`,
        userMessages: [
          'This branch is missing its EIRMS credentials (clientId, clientSecret, apikey).',
          'A merchant admin needs to add them under Merchants → Branches → Edit.',
        ],
        reasonCode: 'BRANCH_MISSING_CREDS',
        reasonMissing: ['clientId', 'clientSecret', 'apikey'],
      });
    }
    const tenant = { merchantId: branch.merchantId, branchId };
    const response = await this.post<EirmsTokenResponse>(
      '/auth/login',
      {
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        apikey: creds.apikey,
        tin: branch.merchant.tin,
      },
      tenant,
    );
    return this.toCached(response, null, tenant);
  }

  private async refresh(prev: CachedToken): Promise<CachedToken> {
    const response = await this.post<EirmsTokenResponse>(
      '/auth/refresh-token',
      { refreshToken: prev.refreshToken },
      prev.tenant,
    );
    return this.toCached(response, prev.encryptionKey, prev.tenant);
  }

  private toCached(
    response: EirmsTokenResponse,
    fallbackEncryptionKey: string | null,
    tenant: { merchantId: string; branchId: string },
  ): CachedToken {
    return {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      encryptionKey: response.encryptionKey ?? fallbackEncryptionKey,
      expiresAt: Date.now() + response.expiresIn * 1000,
      claims: decodeJwtClaims(response.accessToken),
      tenant,
    };
  }

  private isExpiring(token: CachedToken): boolean {
    return token.expiresAt - Date.now() <= REFRESH_GRACE_SECONDS * 1000;
  }

  private async post<T>(
    path: string,
    body: unknown,
    tenant: { merchantId: string; branchId: string },
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const startedAt = Date.now();
    const action = eirmsAction(path);
    try {
      const wireBody = this.signing.isHttps()
        ? await this.signing.wrap(body, tenant)
        : body;
      const response = await firstValueFrom(
        this.http.post<EirmsEnvelope<T>>(url, wireBody, {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const data = response.data;
      const ok = !!data && data.status === 'SUCCESS' && !!data.data;
      void this.audit.recordOutbound({
        action,
        path,
        requestBody: body,
        responseBody: data,
        statusCode: response.status,
        success: ok,
        errorMessage: ok
          ? undefined
          : `unexpected envelope status=${data?.status}`,
        durationMs: Date.now() - startedAt,
      });
      if (!ok) {
        throw new ServiceUnavailableException(
          `EIRMS ${path} returned unexpected envelope: status=${data?.status}`,
        );
      }
      return data.data;
    } catch (err) {
      if (err instanceof AxiosError) {
        const status = err.response?.status ?? 'network';
        const detail =
          (err.response?.data && JSON.stringify(err.response.data)) ??
          err.message;
        void this.audit.recordOutbound({
          action,
          path,
          requestBody: body,
          responseBody: err.response?.data ?? null,
          statusCode: typeof status === 'number' ? status : undefined,
          success: false,
          errorMessage: err.message,
          durationMs: Date.now() - startedAt,
        });
        throw new ServiceUnavailableException(
          `EIRMS ${path} failed (${status}): ${detail}`,
        );
      }
      throw err;
    }
  }
}

function decodeJwtClaims(token: string): JwtClaims {
  try {
    const payload = token.split('.')[1];
    if (!payload) return {};
    const json = Buffer.from(payload, 'base64url').toString('utf-8');
    return JSON.parse(json) as JwtClaims;
  } catch {
    return {};
  }
}
