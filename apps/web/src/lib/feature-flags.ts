/**
 * Build-time feature switches. Each mirrors an API-side flag of the same
 * name — turning one on here without the server counterpart just moves the
 * failure from a hidden button to a 404.
 */

/**
 * Offline invoice drafts (save-on-outage, sync later). Parked: the POS won't
 * offer "save as draft" and the invoices page won't list them. Mirrors
 * DRAFTS_ENABLED on the API.
 */
export const DRAFTS_ENABLED =
  import.meta.env.VITE_DRAFTS_ENABLED === "true";
