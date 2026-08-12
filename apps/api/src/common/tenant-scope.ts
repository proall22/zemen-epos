import type { RequestContext } from '../audit/request-context.service';

/**
 * Tenant-scoping helpers for Prisma `where` clauses.
 *
 * The pattern: every tenant-touching service reads the caller's context from
 * {@link RequestContextService} and merges these fragments into its queries.
 * SUPER_ADMIN (back-office) and system-internal callers have `merchantId === null`
 * in the context — they get an empty fragment so they see across tenants.
 * Merchant-scoped users get a fragment that pins the query to their merchant.
 *
 * Keep these helpers dumb: they take a context, return a where fragment, and
 * never touch Prisma directly. Service code stays readable: `where: { ...filters,
 * ...merchantScope(ctx) }`.
 */

/** Pin a query to the caller's merchant (no-op for SUPER_ADMIN / system). */
export function merchantScope(
  ctx: RequestContext | undefined,
): { merchantId?: string } {
  const merchantId = ctx?.merchantId;
  return merchantId ? { merchantId } : {};
}

/** Pin a query to the caller's branch when they have one (CASHIER); otherwise
 *  a no-op — ACCOUNTANT/SUPPORT span all branches inside their merchant, and
 *  SUPER_ADMIN spans all branches across all merchants. Compose with
 *  {@link merchantScope} so merchant admins still get the merchant filter. */
export function branchScope(
  ctx: RequestContext | undefined,
): { branchId?: string } {
  const branchId = ctx?.branchId;
  return branchId ? { branchId } : {};
}

/** Combined fragment for the common case: filter by merchant, and by branch
 *  if the caller has one. Skips empty keys so the resulting `where` stays
 *  minimal and Prisma-friendly. */
export function tenantScope(
  ctx: RequestContext | undefined,
): { merchantId?: string; branchId?: string } {
  return { ...merchantScope(ctx), ...branchScope(ctx) };
}

/**
 * List-only scope resolver: MERCHANT_ADMIN may opt out of the branch filter
 * by passing `crossBranch: true` (comes from `?scope=merchant`). Everyone
 * else gets the normal branch-pinned view — cashiers and accountants only
 * ever see their currently-active branch. Merchant filter is always applied.
 */
export function listScope(
  ctx: RequestContext | undefined,
  opts?: { crossBranch?: boolean },
): { merchantId?: string; branchId?: string } {
  if (opts?.crossBranch && ctx?.actorRole === 'MERCHANT_ADMIN') {
    return { ...merchantScope(ctx) };
  }
  return tenantScope(ctx);
}

/** Throws if the caller is a merchant-scoped role without a merchantId on
 *  their context — defense-in-depth so a misconfigured user can never read
 *  across tenants. SUPER_ADMIN passes (cross-tenant). System-internal callers
 *  (no ctx at all — bootstrap, jobs) also pass. */
export function assertMerchantContext(
  ctx: RequestContext | undefined,
): void {
  if (!ctx) return; // no request — internal call
  if (ctx.actorRole === 'SUPER_ADMIN') return;
  if (!ctx.actorRole) return; // pre-auth (login etc.) — handled by AuthGuard
  if (!ctx.merchantId) {
    throw new Error(
      'Merchant context missing for non-super-admin actor; refusing query.',
    );
  }
}
