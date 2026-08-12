import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Buyer-facing document links (invoice print page) carry an HMAC token tied to
 * the document id, so the page can't be enumerated by guessing ids. Signed and
 * verified with the same server secret (PUBLIC_LINK_SECRET, falling back to
 * JWT_SECRET). No DB column needed — the token is derived, not stored.
 */
export function signPublicToken(id: string, secret: string): string {
  return createHmac('sha256', secret).update(id).digest('hex').slice(0, 24);
}

export function verifyPublicToken(
  id: string,
  token: string | undefined,
  secret: string,
): boolean {
  if (!token || !secret) return false;
  const expected = signPublicToken(id, secret);
  if (token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

/** Buyer link to the printable Variant 1 invoice page, or undefined when we
 *  can't build one (no app URL / no secret configured). */
export function publicInvoiceUrl(
  appPublicUrl: string,
  id: string,
  secret: string,
): string | undefined {
  if (!appPublicUrl || !secret) return undefined;
  return `${appPublicUrl}/p/invoices/${id}?t=${signPublicToken(id, secret)}`;
}

/** Buyer link to the printable receipt page, or undefined when we can't
 *  build one. Same HMAC-token scheme as {@link publicInvoiceUrl} — bad/
 *  missing token reads as 404 server-side, never a login bounce. */
export function publicReceiptUrl(
  appPublicUrl: string,
  id: string,
  secret: string,
): string | undefined {
  if (!appPublicUrl || !secret) return undefined;
  return `${appPublicUrl}/p/receipts/${id}?t=${signPublicToken(id, secret)}`;
}
