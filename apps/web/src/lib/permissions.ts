import type { UserRole } from "./types";

/**
 * Mirror of `apps/api/src/auth/permissions.ts` — used to gate UI controls
 * client-side. The backend remains authoritative; this just hides things the
 * user can't actually do.
 */

/**
 * Permissions a SUPER_ADMIN holds natively — platform operation only, no
 * merchant business data. Merchant-scoped codes are unlocked only through an
 * active consent grant (see {@link CONSENT_SCOPE_PERMISSIONS}). Mirror of the
 * API's `PLATFORM_PERMISSIONS`.
 */
export const PLATFORM_PERMISSIONS: ReadonlyArray<string> = [
  "merchant.view",
  "merchant.create",
  "merchant.update",
  "branch.view",
  "branch.create",
  "branch.update",
  "user.view",
  "user.create",
  "user.update",
  "audit.view",
  "deliverability.view",
  "translation.manage",
  "dashboard.system",
  "consent.request",
  "consent.manage",
  "configuration.view",
  "configuration.manage",
];

/**
 * Consent scope → the codes it unlocks for a SUPER_ADMIN acting inside a
 * consented merchant. Mirror of the API's `CONSENT_SCOPE_PERMISSIONS`.
 */
export const CONSENT_SCOPE_PERMISSIONS: Record<
  string,
  ReadonlyArray<string>
> = {
  DASHBOARD: ["dashboard.view"],
  INVOICES: ["invoice.view"],
  RECEIPTS: ["receipt.view"],
  INVENTORY: ["inventory.view", "store.view", "vendor.view", "purchase.view"],
  INVENTORY_EDIT: [
    "inventory.create",
    "inventory.update",
    "inventory.delete",
    "store.create",
    "store.update",
    "store.delete",
    "vendor.create",
    "vendor.update",
    "vendor.delete",
    "purchase.create",
    "writeoff.create",
  ],
  USERS_EDIT: ["user.view", "user.create", "user.update"],
};

/** Effective SUPER_ADMIN permission set given the active consent scopes. */
export function effectiveSuperAdminPermissions(
  consentScopes?: ReadonlyArray<string>,
): Set<string> {
  const set = new Set<string>(PLATFORM_PERMISSIONS);
  for (const scope of consentScopes ?? []) {
    for (const code of CONSENT_SCOPE_PERMISSIONS[scope] ?? []) set.add(code);
  }
  return set;
}

const ROLE_PERMISSIONS: Record<UserRole, ReadonlyArray<string>> = {
  // Technical system administrators mirror the backend wildcard grant.
  SUPER_ADMIN: ["*"],
  // Tenant owner — manages merchant/branches/users + can do every operational
  // task within their tenant. See the API mirror for the canonical list.
  MERCHANT_ADMIN: [
    "dashboard.view",
    "inventory.view",
    "inventory.create",
    "inventory.update",
    "inventory.delete",
    "buyer.view",
    "buyer.create",
    "buyer.update",
    "buyer.delete",
    "invoice.view",
    "invoice.create",
    "invoice.update",
    "receipt.view",
    "receipt.create",
    "withholding.view",
    "withholding.create",
    "merchant.view",
    "merchant.update",
    "merchant.export",
    "branch.view",
    "branch.create",
    "branch.update",
    "user.view",
    "user.create",
    "user.update",
    "audit.view",
    "store.view",
    "store.create",
    "store.update",
    "store.delete",
    "vendor.view",
    "vendor.create",
    "vendor.update",
    "vendor.delete",
    "purchase.view",
    "purchase.create",
    "writeoff.create",
    "report.view",
    "report.manage",
  ],
  BRANCH_ADMIN: [
    "dashboard.view",
    "inventory.view",
    "inventory.create",
    "inventory.update",
    "inventory.delete",
    "buyer.view",
    "buyer.create",
    "buyer.update",
    "buyer.delete",
    "invoice.view",
    "invoice.create",
    "invoice.update",
    "receipt.view",
    "receipt.create",
    "withholding.view",
    "branch.view",
    "store.view",
    "store.create",
    "store.update",
    "vendor.view",
    "vendor.create",
    "vendor.update",
    "purchase.view",
    "purchase.create",
    "writeoff.create",
    "report.view",
    "report.manage",
  ],
  // Bookkeeping role — operational only, no tenant admin.
  ACCOUNTANT: [
    "dashboard.view",
    "inventory.view",
    "buyer.view",
    "buyer.create",
    "buyer.update",
    "buyer.delete",
    "invoice.view",
    "invoice.create",
    "invoice.update",
    "receipt.view",
    "withholding.view",
    "withholding.create",
    "branch.view",
    "audit.view",
    "store.view",
    "vendor.view",
    "purchase.view",
    "report.view",
    "report.manage",
  ],
  STORE_KEEPER: [
    "inventory.view",
    "inventory.create",
    "inventory.update",
    "inventory.delete",
    "branch.view",
    "store.view",
    "store.create",
    "store.update",
    "store.delete",
    "vendor.view",
    "vendor.create",
    "vendor.update",
    "vendor.delete",
    "purchase.view",
    "purchase.create",
    "writeoff.create",
  ],
  CASHIER: [
    "dashboard.view",
    "inventory.view",
    "buyer.view",
    "buyer.create",
    "invoice.view",
    "invoice.create",
    "invoice.update",
    "receipt.view",
    "receipt.create",
    "store.view",
  ],
  SUPPORT: [
    "inventory.view",
    "buyer.view",
    "invoice.view",
    "receipt.view",
    "withholding.view",
  ],
  // Compatibility until legacy branch-manager rows migrate to BRANCH_ADMIN.
  ADMIN: [
    "dashboard.view", "inventory.view", "inventory.create", "inventory.update",
    "inventory.delete", "buyer.view", "buyer.create", "buyer.update", "buyer.delete",
    "invoice.view", "invoice.create", "invoice.update", "receipt.view", "receipt.create",
    "withholding.view", "branch.view", "store.view", "store.create", "store.update",
    "vendor.view", "vendor.create", "vendor.update", "purchase.view", "purchase.create",
    "writeoff.create", "report.view", "report.manage",
  ],
};

export function hasPermission(
  role: UserRole | undefined | null,
  code: string,
  consentScopes?: ReadonlyArray<string>,
): boolean {
  if (!role) return false;
  
  if (role === "SUPER_ADMIN") {
    return effectiveSuperAdminPermissions(consentScopes).has(code);
  }
  
  const perms = ROLE_PERMISSIONS[role] ?? [];
  return perms.includes("*") || perms.includes(code);
}
