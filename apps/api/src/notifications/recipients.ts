export interface Recipients {
  to: string[];
  bcc?: string[];
}

/**
 * Buyer gets the email; the merchant copy rides along as BCC so the buyer
 * never sees it. When there's no buyer email (e.g. walk-in or withholding),
 * the merchant copy becomes the primary recipient. Null means "nobody to
 * notify — skip".
 */
export function resolveRecipients(
  buyerEmail: string | null | undefined,
  merchantCopy: string[],
): Recipients | null {
  const buyer = buyerEmail?.trim();
  if (buyer) {
    return {
      to: [buyer],
      bcc: merchantCopy.length > 0 ? merchantCopy : undefined,
    };
  }
  if (merchantCopy.length > 0) {
    return { to: merchantCopy };
  }
  return null;
}
