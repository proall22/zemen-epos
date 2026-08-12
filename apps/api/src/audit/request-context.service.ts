import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface ChallengeContext {
  /** A Turnstile token was carried on the request body. */
  provided: boolean;
  /** Cloudflare's siteverify returned success=true. */
  verified: boolean;
  /** Error codes from siteverify when verified=false, when present. */
  errorCodes?: string[];
}

export interface RequestContext {
  requestId: string;
  ip?: string;
  userAgent?: string;
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  /** Tenant the actor belongs to. null = SUPER_ADMIN (cross-tenant) or system. */
  merchantId?: string | null;
  /** Branch the actor is acting as. null = merchant-wide role or system. */
  branchId?: string | null;
  /** True once {@link RequestContextService.setBranch} has resolved a branch
   *  from a validated X-Branch-Id. Stops {@link RequestContextService.setActor}
   *  from overwriting it with the JWT's (null for merchant-wide roles), which
   *  would silently drop branch scoping for merchant admins. */
  branchResolved?: boolean;
  /** Consent scopes of the active grant when a SUPER_ADMIN has entered a
   *  merchant (X-Consent-Merchant-Id). Empty/undefined = platform view. Used
   *  by permission checks that need the effective super-admin permission set. */
  consentScopes?: string[];
  /** Turnstile outcome stamped by TurnstileGuard for routes that ran it.
   *  Auth audit rows lift this onto the trail. */
  challenge?: ChallengeContext;
}

/**
 * Per-request store backed by AsyncLocalStorage. A middleware opens the context
 * at the start of every request; the audit interceptor fills in the actor once
 * the auth guard has run. Outbound EIRMS calls — buried deep in services — read
 * the actor from here so they can be attributed to whoever triggered them,
 * without threading the user through every method signature.
 */
@Injectable()
export class RequestContextService {
  private readonly als = new AsyncLocalStorage<RequestContext>();

  run(ctx: RequestContext, fn: () => void): void {
    this.als.run(ctx, fn);
  }

  get(): RequestContext | undefined {
    return this.als.getStore();
  }

  setActor(actor: {
    sub: string;
    email: string;
    role: string;
    merchantId: string | null;
    branchId: string | null;
  }): void {
    const store = this.als.getStore();
    if (!store) return;
    store.actorId = actor.sub;
    store.actorEmail = actor.email;
    store.actorRole = actor.role;
    store.merchantId = actor.merchantId;
    if (!store.branchResolved) store.branchId = actor.branchId;
  }

  setChallenge(challenge: ChallengeContext): void {
    const store = this.als.getStore();
    if (!store) return;
    store.challenge = challenge;
  }

  /** Override the branchId set by setActor. Used by the branch-context
   *  interceptor when a non-cashier user selects a branch via the
   *  X-Branch-Id request header. Validated before this call. */
  setBranch(branchId: string): void {
    const store = this.als.getStore();
    if (!store) return;
    store.branchId = branchId;
    store.branchResolved = true;
  }

  /** Pin the request to a merchant on behalf of a consented SUPER_ADMIN.
   *  Set by the consent-context interceptor after the PermissionsGuard has
   *  validated an active grant. Once set, every tenant-scoped query pins to
   *  this merchant automatically (see common/tenant-scope.ts). `scopes` is the
   *  grant's scope set, used to compute the effective permission list. */
  setMerchant(merchantId: string, scopes: string[]): void {
    const store = this.als.getStore();
    if (!store) return;
    store.merchantId = merchantId;
    store.consentScopes = scopes;
  }
}
