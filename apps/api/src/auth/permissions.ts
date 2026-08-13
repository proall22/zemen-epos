import type { UserRole } from '@prisma/client';

/**
 * Permission codes are `<resource>.<action>` strings. Roles bundle them.
 * `*` is a wildcard that grants every permission (super-admin only).
 *
 * Update this map to adjust who can do what — it's the single source of
 * truth for both backend guards and frontend UI gating (the frontend ships
 * its own mirror under `apps/web/src/lib/permissions.ts`).
 */
export const PERMISSIONS = {
  user: ['view', 'create', 'update', 'delete'],
  inventory: ['view', 'create', 'update', 'delete'],
  buyer: ['view', 'create', 'update', 'delete'],
  invoice: ['view', 'create', 'update', 'delete'],
  receipt: ['view', 'create', 'update', 'delete'],
  withholding: ['view', 'create'],
  // `dashboard.view` = a single merchant's dashboard (merchant users, and a
  // SUPER_ADMIN only via consent). `dashboard.system` = the platform-wide
  // aggregate dashboard (SUPER_ADMIN native).
  dashboard: ['view', 'system'],
  audit: ['view'],
  deliverability: ['view'],
  // Merchant + branch onboarding — back-office (SUPER_ADMIN) and merchant
  // admins who manage their own merchant's branches. Branch creation/credential
  // rotation is tenant-scoped; SUPER_ADMIN can do it for any merchant.
  merchant: ['view', 'create', 'update', 'export'],
  branch: ['view', 'create', 'update'],
  // Multi-store inventory expansion (Phase 1+): named stores per branch,
  // vendor list, procurement purchase records, and a distinct write-off
  // action (so damage / expiry / theft aren't just an "ADJUSTMENT" note).
  store: ['view', 'create', 'update', 'delete'],
  vendor: ['view', 'create', 'update', 'delete'],
  purchase: ['view', 'create'],
  writeoff: ['create'],
  translation: ['manage'],
  // Recurring emailed reports. A class of its own rather than reusing
  // `dashboard.view`: only MERCHANT_ADMIN holds that, and accountants — who
  // are the ones asking for these — deliberately don't.
  report: ['view', 'manage'],
  // Cross-tenant access consent. `request` = a SUPER_ADMIN asks a merchant
  // admin for time-limited access; `manage` = list / enter / end their own
  // grants. Merchant-side decide/revoke is authorized by MERCHANT_ADMIN
  // membership, not a global code.
  consent: ['request', 'manage'],
} as const;

export type PermissionResource = keyof typeof PERMISSIONS;
export type PermissionCode = `${PermissionResource}.${string}`;

/**
 * Permissions a SUPER_ADMIN holds natively — platform operation, no merchant
 * business data. Everything NOT in this set is "merchant-scoped" and, for a
 * SUPER_ADMIN, reachable only through an active consent grant (see
 * {@link CONSENT_SCOPE_PERMISSIONS} + PermissionsGuard). Merchant-scoped roles
 * are unaffected by this list — they keep their own ROLE_PERMISSIONS grants.
 */
export const PLATFORM_PERMISSIONS: ReadonlyArray<string> = [
  'merchant.view',
  'merchant.create',
  'merchant.update',
  'merchant.export',
  'branch.view',
  'branch.create',
  'branch.update',
  'user.view',
  'user.create',
  'user.update',
  'audit.view',
  'deliverability.view',
  'translation.manage',
  'dashboard.system',
  'consent.request',
  'consent.manage',
  'invoice.view',
  'receipt.view',
  'withholding.view',
  'inventory.view',
  'store.view',
  'vendor.view',
  'purchase.view',
  'report.view',
];

/**
 * Consent scope → the permission codes it unlocks for a SUPER_ADMIN acting
 * inside a consented merchant. Kept in lock-step with the `ConsentScope`
 * Prisma enum. `USERS_EDIT` deliberately omits `user.delete`; consent never
 * grants invoice/receipt *registration* (no `invoice.create`/`receipt.create`)
 * — a platform admin never transacts on a merchant's behalf.
 */
export const CONSENT_SCOPE_PERMISSIONS: Record<
  string,
  ReadonlyArray<string>
> = {
  DASHBOARD: ['dashboard.view'],
  INVOICES: ['invoice.view'],
  RECEIPTS: ['receipt.view'],
  INVENTORY: ['inventory.view', 'store.view', 'vendor.view', 'purchase.view'],
  INVENTORY_EDIT: [
    'inventory.create',
    'inventory.update',
    'inventory.delete',
    'store.create',
    'store.update',
    'store.delete',
    'vendor.create',
    'vendor.update',
    'vendor.delete',
    'purchase.create',
    'writeoff.create',
  ],
  USERS_EDIT: ['user.view', 'user.create', 'user.update'],
};

/**
 * Effective permission set for a SUPER_ADMIN given the scopes of their active
 * consent grant (empty / undefined when they haven't entered a merchant).
 * Both the backend guard and the frontend mirror compute access the same way.
 */
export function effectiveSuperAdminPermissions(
  consentScopes?: ReadonlyArray<string>,
): Set<string> {
  const set = new Set<string>(PLATFORM_PERMISSIONS);
  for (const scope of consentScopes ?? []) {
    for (const code of CONSENT_SCOPE_PERMISSIONS[scope] ?? []) set.add(code);
  }
  return set;
}

export const ROLE_PERMISSIONS: Record<UserRole, ReadonlyArray<string>> = {
  // Technical system administrators have full API permission. Tenant-aware
  // services may still require X-Consent-Merchant-Id / X-Branch-Id to select
  // which merchant or branch a business-data operation targets; the wildcard
  // removes permission-code 403s, not data-scope ambiguity.
  SUPER_ADMIN: ['*'],
  /**
   * Tenant owner. Manages their own merchant + branches (incl. EIRMS credential
   * rotation) and provisions users within their tenant. Can also do every
   * operational task within their tenant — small merchants where one person
   * wears every hat shouldn't need a second account. Cannot create new
   * merchants and cannot read other tenants' data.
   */
  MERCHANT_ADMIN: [
    'dashboard.view',
    'inventory.view',
    'inventory.create',
    'inventory.update',
    'inventory.delete',
    'buyer.view',
    'buyer.create',
    'buyer.update',
    'buyer.delete',
    'invoice.view',
    'invoice.create',
    'invoice.update',
    'receipt.view',
    'receipt.create',
    'withholding.view',
    'withholding.create',
    'merchant.view',
    'merchant.update',
    'merchant.export',
    'branch.view',
    'branch.create',
    'branch.update',
    'user.view',
    'user.create',
    'user.update',
    // Audit trail scoped to their own merchant (AuditService filters by ctx).
    'audit.view',
    // Multi-store inventory: merchant admin owns their stores, vendors,
    // purchases, and write-offs.
    'store.view',
    'store.create',
    'store.update',
    'store.delete',
    'vendor.view',
    'vendor.create',
    'vendor.update',
    'vendor.delete',
    'purchase.view',
    'purchase.create',
    'writeoff.create',
    'report.view',
    'report.manage',
  ],
  /**
   * Branch operator. Every query is pinned by RequestContext to the single
   * granted branch. They run sales and stock operations but cannot modify the
   * merchant, branch credentials, users, consent, or platform settings.
   */
  BRANCH_ADMIN: [
    'dashboard.view',
    'inventory.view',
    'inventory.create',
    'inventory.update',
    'inventory.delete',
    'buyer.view',
    'buyer.create',
    'buyer.update',
    'buyer.delete',
    'invoice.view',
    'invoice.create',
    'invoice.update',
    'receipt.view',
    'receipt.create',
    'withholding.view',
    'branch.view',
    'store.view',
    'store.create',
    'store.update',
    'vendor.view',
    'vendor.create',
    'vendor.update',
    'purchase.view',
    'purchase.create',
    'writeoff.create',
    'report.view',
    'report.manage',
  ],
  /**
   * Bookkeeping role. Manages inventory + buyers, registers invoices, files
   * withholding receipts. No tenant administration — can't manage branches'
   * settings/EIRMS creds or users, but can *see* the branch list (read-only)
   * to switch between branches. Reports to a MERCHANT_ADMIN.
   */
  ACCOUNTANT: [
    'dashboard.view',
    'inventory.view',
    'buyer.view',
    'buyer.create',
    'buyer.update',
    'buyer.delete',
    'invoice.view',
    'invoice.create',
    'invoice.update',
    'receipt.view',
    'withholding.view',
    'withholding.create',
    'branch.view',
    'audit.view',
    // Accountants handle procurement + write-offs. Store CRUD is admin-only.
    'store.view',
    'vendor.view',
    'purchase.view',
    // Scheduled reports complement the accountant's financial dashboard.
    'report.view',
    'report.manage',
  ],
  STORE_KEEPER: [
    'inventory.view',
    'inventory.create',
    'inventory.update',
    'inventory.delete',
    'branch.view',
    'store.view',
    'store.create',
    'store.update',
    'store.delete',
    'vendor.view',
    'vendor.create',
    'vendor.update',
    'vendor.delete',
    'purchase.view',
    'purchase.create',
    'writeoff.create',
  ],
  CASHIER: [
    'dashboard.view',
    'inventory.view',
    'buyer.view',
    'buyer.create',
    'invoice.view',
    'invoice.create',
    'invoice.update',
    'receipt.view',
    'receipt.create',
    // Read-only inventory sight lines the POS needs to render stock hints.
    'store.view',
  ],
  SUPPORT: [
    'inventory.view',
    'buyer.view',
    'invoice.view',
    'receipt.view',
    'withholding.view',
  ],
  // Compatibility until branch-bound legacy rows migrate to BRANCH_ADMIN.
  ADMIN: [
    'dashboard.view', 'inventory.view', 'inventory.create', 'inventory.update',
    'inventory.delete', 'buyer.view', 'buyer.create', 'buyer.update', 'buyer.delete',
    'invoice.view', 'invoice.create', 'invoice.update', 'receipt.view', 'receipt.create',
    'withholding.view', 'branch.view', 'store.view', 'store.create', 'store.update',
    'vendor.view', 'vendor.create', 'vendor.update', 'purchase.view', 'purchase.create',
    'writeoff.create', 'report.view', 'report.manage',
  ],
};

/**
 * Does `role` grant `code`? For SUPER_ADMIN, `consentScopes` layers on the
 * merchant-scoped permissions of an active consent grant (omit / empty when
 * they're in the platform view). Merchant-scoped roles ignore consentScopes.
 */
export function hasPermission(
  role: UserRole | undefined,
  code: string,
  consentScopes?: ReadonlyArray<string>,
): boolean {
  // Kept in the signature for compatibility with consent-aware callers. Full
  // SUPER_ADMIN wildcard mode does not need the scopes to grant a code.
  void consentScopes;
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role] ?? [];
  return perms.includes('*') || perms.includes(code);
}
