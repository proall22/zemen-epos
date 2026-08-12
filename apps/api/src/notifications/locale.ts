import { DEFAULT_LANGUAGE } from '@eirms/i18n-strings';

/**
 * Resolve the language a buyer-facing notification should be rendered in.
 *
 * Fallback chain, in order:
 *   1. Buyer's stored `language` (per-buyer preference).
 *   2. Merchant's `defaultLanguage` (merchant-wide default).
 *   3. Platform default (English).
 *
 * `null` / empty strings on either input are treated as "unset" so a
 * partial record doesn't drop to a garbage code.
 */
export function resolveNotificationLanguage(input: {
  buyerLanguage?: string | null;
  merchantDefaultLanguage?: string | null;
}): string {
  const buyer = input.buyerLanguage?.trim();
  if (buyer) return buyer;
  const merchant = input.merchantDefaultLanguage?.trim();
  if (merchant) return merchant;
  return DEFAULT_LANGUAGE;
}
