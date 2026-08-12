/**
 * Seller identity printed on tax invoices / receipts.
 *
 * Before multi-tenancy this was a build-time singleton sourced from Vite env.
 * After Phase E it's resolved at runtime from the signed-in user's merchant +
 * branch (fetched via `GET /auth/me/context`). The env values still live here
 * as a **fallback** so:
 *   - the buyer-facing public-invoice page (no auth) keeps rendering, and
 *   - any field the merchant hasn't filled in yet falls back to a sensible
 *     default rather than blanking.
 *
 * Prefer {@link useSellerInfo} from React components — it pulls from the
 * auth context. Code paths that legitimately need the env-only fallback can
 * still import the {@link SELLER_INFO} constant.
 */
import type {
  DocumentBranchIdentity,
  DocumentMerchantIdentity,
  MeBranch,
  Merchant,
} from "./types";

const env = import.meta.env;

export interface SellerInfo {
  legalName: string;
  tradeName: string;
  tin: string;
  subTin: string;
  vatNumber: string;
  systemNumber: string;
  systemType: string;
  phone: string;
  email: string;
  city: string;
  region: string;
  zone: string;
  wereda: string;
  kebele: string;
  houseNumber: string;
}

/** Env-only fallback — used by unauthenticated pages and as a per-field
 *  default when the loaded merchant/branch has a blank for that field. */
export const SELLER_INFO: SellerInfo = {
  legalName: env.VITE_SELLER_LEGAL_NAME || "Zemen-ePos Financial Services S.C.",
  tradeName: env.VITE_SELLER_TRADE_NAME || "Zemen-ePos",
  tin: env.VITE_SELLER_TIN || "0102830360",
  subTin: env.VITE_SELLER_SUB_TIN || "",
  vatNumber: env.VITE_SELLER_VAT_NUMBER || "43256663343256663322",
  systemNumber: env.VITE_SELLER_SYSTEM_NUMBER || "5A4A83218D",
  systemType: env.VITE_SELLER_SYSTEM_TYPE || "POS",
  phone: env.VITE_SELLER_PHONE || "+251911774343",
  email: env.VITE_SELLER_EMAIL || "einvoice@e-pay.et",
  city: env.VITE_SELLER_CITY || "Addis Ababa",
  region: env.VITE_SELLER_REGION || "Addis Ababa",
  zone: env.VITE_SELLER_ZONE || "Bole",
  wereda: env.VITE_SELLER_WEREDA || "13",
  kebele: env.VITE_SELLER_KEBELE || "",
  houseNumber: env.VITE_SELLER_HOUSE_NUMBER || "",
};

/**
 * Seller identity for a *registered document*, taken from the branch and
 * merchant stored on that document — never from the branch currently selected
 * in the switcher. Reprinting a Bahir Dar invoice while switched to Addis must
 * still show Bahir Dar's system number.
 *
 * Branch is the preference, merchant is the backfill: a branch trades under
 * its own name/sub-TIN/address where it has them, and inherits the merchant's
 * legal name and TIN where it doesn't. Env defaults are the last resort and
 * only apply to documents registered before this data was captured.
 */
export function sellerInfoFromDocument(doc: {
  branch?: DocumentBranchIdentity | null;
  merchant?: DocumentMerchantIdentity | null;
}): SellerInfo {
  const b = doc.branch ?? null;
  const m = doc.merchant ?? null;
  if (!b && !m) return SELLER_INFO;
  return {
    legalName: m?.legalName || SELLER_INFO.legalName,
    // The establishment's own trading name wins over the merchant's.
    tradeName: b?.tradeName || m?.tradeName || SELLER_INFO.tradeName,
    tin: m?.tin || SELLER_INFO.tin,
    subTin: b?.subTin || "",
    vatNumber: b?.vatNumber || m?.vatNumber || SELLER_INFO.vatNumber,
    systemNumber: b?.systemNumber || SELLER_INFO.systemNumber,
    systemType: SELLER_INFO.systemType,
    phone: m?.phone || SELLER_INFO.phone,
    email: m?.email || SELLER_INFO.email,
    city: b?.city || m?.city || SELLER_INFO.city,
    region: b?.region || m?.region || SELLER_INFO.region,
    zone: b?.zone || m?.zone || SELLER_INFO.zone,
    wereda: b?.wereda || m?.wereda || SELLER_INFO.wereda,
    kebele: b?.kebele || m?.kebele || SELLER_INFO.kebele,
    houseNumber: b?.houseNumber || m?.houseNumber || SELLER_INFO.houseNumber,
  };
}

/** Compose a {@link SellerInfo} from the loaded merchant + branch, falling
 *  back to {@link SELLER_INFO} for any missing field. Branch address fields
 *  win over the merchant's so a Bahir Dar branch of an Addis Ababa merchant
 *  prints the Bahir Dar address on its own receipts. */
export function sellerInfoFromContext(
  merchant: Merchant | null,
  branch: MeBranch | null,
): SellerInfo {
  if (!merchant && !branch) return SELLER_INFO;
  return {
    legalName: merchant?.legalName || SELLER_INFO.legalName,
    tradeName: merchant?.tradeName || SELLER_INFO.tradeName,
    tin: merchant?.tin || SELLER_INFO.tin,
    // Sub-TIN isn't on the merchant model yet; keep the env fallback.
    subTin: SELLER_INFO.subTin,
    vatNumber: merchant?.vatNumber || SELLER_INFO.vatNumber,
    systemNumber: branch?.systemNumber || SELLER_INFO.systemNumber,
    systemType: SELLER_INFO.systemType,
    phone: merchant?.phone || SELLER_INFO.phone,
    email: merchant?.email || SELLER_INFO.email,
    city: branch?.city || merchant?.city || SELLER_INFO.city,
    region: branch?.region || merchant?.region || SELLER_INFO.region,
    zone: branch?.zone || merchant?.zone || SELLER_INFO.zone,
    wereda: branch?.wereda || merchant?.wereda || SELLER_INFO.wereda,
    kebele: branch?.kebele || merchant?.kebele || SELLER_INFO.kebele,
    houseNumber:
      branch?.houseNumber || merchant?.houseNumber || SELLER_INFO.houseNumber,
  };
}
