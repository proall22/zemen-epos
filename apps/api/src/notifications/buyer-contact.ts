import { WALKIN_TIN } from '../buyers/buyers.service';

interface InvoiceLike {
  rawRequest: unknown;
  buyer: { tin: string; email: string | null; phone: string | null };
}

/**
 * Walk-in invoices share a per-merchant sentinel Buyer row that is never
 * updated (would leak contact info across unrelated sales). The captured
 * per-sale email/phone live on the invoice's `rawRequest.BuyerDetails`
 * instead — prefer those whenever the linked buyer is the walk-in sentinel.
 */
export function buyerEmailFor(invoice: InvoiceLike): string | null {
  if (invoice.buyer.tin !== WALKIN_TIN) return invoice.buyer.email ?? null;
  return pickCaptured(invoice, 'Email');
}

export function buyerPhoneFor(invoice: InvoiceLike): string | null {
  if (invoice.buyer.tin !== WALKIN_TIN) return invoice.buyer.phone ?? null;
  return pickCaptured(invoice, 'Phone');
}

function pickCaptured(invoice: InvoiceLike, key: 'Email' | 'Phone'): string | null {
  const raw = invoice.rawRequest as
    | { BuyerDetails?: Record<string, unknown> }
    | null
    | undefined;
  const value = raw?.BuyerDetails?.[key];
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}
