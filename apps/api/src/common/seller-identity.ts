import { Prisma } from '@prisma/client';

/**
 * Seller identity carried on a registered document so a reprint shows the
 * branch that *issued* it, not whichever branch the viewer happens to be
 * switched to. MoR doesn't return this — we keep it for our own records.
 *
 * Branch fields are the preference and the merchant backfills them: a branch
 * may trade under its own name with its own sub-TIN, but inherits the
 * merchant's legal name and TIN when it doesn't.
 *
 * `select` (not `include`) because Branch carries the EIRMS client id/secret/
 * apikey columns, which must never leave the API.
 */
export const BRANCH_IDENTITY_SELECT = {
  id: true,
  name: true,
  systemNumber: true,
  tradeName: true,
  subTin: true,
  vatNumber: true,
  city: true,
  region: true,
  zone: true,
  wereda: true,
  kebele: true,
  houseNumber: true,
  country: true,
} satisfies Prisma.BranchSelect;

export const MERCHANT_IDENTITY_SELECT = {
  id: true,
  legalName: true,
  tradeName: true,
  tin: true,
  vatNumber: true,
  phone: true,
  email: true,
  city: true,
  region: true,
  zone: true,
  wereda: true,
  kebele: true,
  houseNumber: true,
} satisfies Prisma.MerchantSelect;

/** Spread into an invoice/receipt `include` so every read carries the issuing
 *  party's identity. */
export const SELLER_IDENTITY_INCLUDE = {
  branch: { select: BRANCH_IDENTITY_SELECT },
  merchant: { select: MERCHANT_IDENTITY_SELECT },
};
