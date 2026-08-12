import type { ConsentScope } from '@prisma/client';

/** Durations a super-admin may request / a merchant admin may grant, in
 *  minutes. Hard cap is 24h — nothing longer is offered. */
export const ALLOWED_CONSENT_MINUTES = [10, 30, 60, 180, 360, 720, 1440] as const;

/** How long the emailed decision link stays valid (the window to act on the
 *  request, distinct from the granted access window). */
export const CONSENT_LINK_TTL_MINUTES = 24 * 60;

export function isAllowedConsentMinutes(n: number): boolean {
  return (ALLOWED_CONSENT_MINUTES as ReadonlyArray<number>).includes(n);
}

/** Human label for a scope, used in the request email + decision UI copy. */
export const CONSENT_SCOPE_LABELS: Record<ConsentScope, string> = {
  DASHBOARD: 'Dashboard',
  INVOICES: 'Invoices (view)',
  RECEIPTS: 'Receipts (view)',
  INVENTORY: 'Inventory (view)',
  INVENTORY_EDIT: 'Inventory (edit)',
  USERS_EDIT: 'Users (manage)',
};

export function consentScopeLabels(scopes: ConsentScope[]): string[] {
  return scopes.map((s) => CONSENT_SCOPE_LABELS[s] ?? s);
}

/** "1 hour", "30 minutes", "3 hours" — for email + UI. */
export function formatConsentDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  return hours === 1 ? '1 hour' : `${hours} hours`;
}
