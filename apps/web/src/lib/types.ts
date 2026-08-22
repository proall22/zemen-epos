export type UserRole =
  | "SUPER_ADMIN"
  | "MERCHANT_ADMIN"
  | "BRANCH_ADMIN"
  | "ACCOUNTANT"
  | "STORE_KEEPER"
  | "CASHIER"
  | "SUPPORT"
  | "ADMIN"; // legacy

// MERCHANT_ADMIN listed first so the create-user dropdown defaults to it —
// it's the natural pick when a merchant admin invites another owner-level user.
export const ASSIGNABLE_ROLES = [
  "MERCHANT_ADMIN",
  "BRANCH_ADMIN",
  "ACCOUNTANT",
  "STORE_KEEPER",
  "CASHIER",
  "SUPPORT",
] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super admin",
  MERCHANT_ADMIN: "Merchant admin",
  BRANCH_ADMIN: "Branch admin",
  ACCOUNTANT: "Accountant",
  STORE_KEEPER: "Store keeper",
  CASHIER: "Cashier",
  SUPPORT: "Support",
  ADMIN: "Admin",
};

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  merchantId: string | null;
  branchId: string | null;
  language: string;
}

export interface ManagedUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  active: boolean;
  merchantId: string | null;
  /** Pinned default branch — auto-selected on login. */
  branchId: string | null;
  /** Full grant set. Empty for MERCHANT_ADMIN (implicit access). */
  branchIds: string[];
  lastLoginAt: string | null;
  /** ISO timestamp. When in the future the account is locked from sign-in. */
  lockedUntil: string | null;
  /** Number of consecutive failed sign-in attempts since the last success. */
  failedLoginCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Merchant {
  id: string;
  legalName: string;
  tradeName: string | null;
  tin: string;
  email: string | null;
  phone: string | null;
  vatNumber: string | null;
  city: string | null;
  region: string | null;
  zone: string | null;
  wereda: string | null;
  kebele: string | null;
  houseNumber: string | null;
  active: boolean;
  /** Phase G: null while pending super-admin approval; set on first
   *  activation. Approved-then-disabled merchants keep this stamp so the UI
   *  can distinguish "pending" from "disabled". */
  approvedAt: string | null;
  approvedBy: string | null;
  /** Phase I: set when super-admin explicitly rejects a pending signup.
   *  Cleared if super-admin later approves the same merchant. */
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  defaultLanguage: string;
  createdAt: string;
  updatedAt: string;
  /** The person behind the signup (earliest merchant admin) + how many admins
   *  the merchant has. Populated by the merchants list/detail endpoints so a
   *  super-admin can vet a signup before approving. */
  owner?: MerchantOwner | null;
  adminCount?: number;
}

export interface MerchantOwner {
  name: string | null;
  email: string;
  emailVerifiedAt: string | null;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

/** Branch shape over the wire — strips secret EIRMS creds; the *Set booleans
 *  let the UI render "configured / not configured" without exposing values. */
export type MerchantExportStatus =
  | "PENDING"
  | "PROCESSING"
  | "READY"
  | "FAILED"
  | "EXPIRED";

export interface MerchantExport {
  id: string;
  merchantId: string;
  status: MerchantExportStatus;
  requestedAt: string;
  requestedBy: string | null;
  requestedByEmail: string | null;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  filePath: string | null;
  fileBytes: number | null;
  invoiceCount: number;
  receiptCount: number;
  inventoryCount: number;
  buyerCount: number;
  downloadCount: number;
  errorMessage: string | null;
}

/** Issuing-party identity carried on every registered invoice/receipt so a
 *  reprint shows the branch that issued it rather than the one currently
 *  selected. Branch wins; merchant backfills. */
export interface DocumentBranchIdentity {
  id: string;
  name: string;
  systemNumber: string;
  tradeName: string | null;
  subTin: string | null;
  vatNumber: string | null;
  city: string | null;
  region: string | null;
  zone: string | null;
  wereda: string | null;
  kebele: string | null;
  houseNumber: string | null;
  country: string | null;
}

export interface DocumentMerchantIdentity {
  id: string;
  legalName: string | null;
  tradeName: string | null;
  tin: string | null;
  vatNumber: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  region: string | null;
  zone: string | null;
  wereda: string | null;
  kebele: string | null;
  houseNumber: string | null;
}

/** A row of {@link listStoreStock} — what one store holds. */
export interface StoreStockRow {
  inventoryItemId: string;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  /** Held by live POS carts at this store. */
  reserved: number;
  /** quantity − reserved: what a cashier could ring up right now. */
  available: number;
  lowStockThreshold: number | null;
  avgCost: number | null;
}

/** A row of {@link listItemStock} — where one item is held. */
export interface ItemStockRow {
  storeId: string;
  storeName: string;
  storeCode: string;
  branchId: string;
  branchName: string;
  isSalesFloor: boolean;
  quantity: number;
}

export interface StockMovementRow {
  id: string;
  createdAt: string;
  reason: StockMovementReason;
  delta: number;
  note: string | null;
  actorEmail: string | null;
  inventoryItemId: string;
  itemCode: string;
  itemDescription: string;
  itemImageUrl: string | null;
  storeId: string | null;
  storeName: string | null;
  branchName: string | null;
  /** Shared by the two halves of a transfer so the log can pair them. */
  transferId: string | null;
  refType: string | null;
  refId: string | null;
}

export interface StockMovementPage {
  items: StockMovementRow[];
  nextCursor: string | null;
}

export interface SafeBranch {
  id: string;
  merchantId: string;
  name: string;
  systemNumber: string;
  city: string | null;
  region: string | null;
  zone: string | null;
  wereda: string | null;
  kebele: string | null;
  houseNumber: string | null;
  /** Branch tax identity fields — populated during INSA certificate
   *  onboarding but persisted on the branch so other flows can reuse them. */
  subTin: string | null;
  /** Name this establishment trades under; may differ from the merchant's. */
  tradeName: string | null;
  vatNumber: string | null;
  country: string | null;
  /** Per-branch stock enforcement. ALLOW_NEGATIVE (default) or
   *  BLOCK_ON_EMPTY — the latter refuses live sales of tracked items that
   *  would drive on-hand below zero. */
  stockPolicy: "ALLOW_NEGATIVE" | "BLOCK_ON_EMPTY";
  /** Phase H: optional geo-pin (WGS84) captured via the map picker. */
  latitude: number | null;
  longitude: number | null;
  eirmsClientIdSet: boolean;
  eirmsClientSecretSet: boolean;
  eirmsApikeySet: boolean;
  /** Signing material in Vault — not derivable from the branch row. */
  hasSigningKey: boolean;
  hasCert: boolean;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Non-secret branch row shown in the global Super Admin review queue. */
export interface PendingBranchReview {
  id: string;
  merchantId: string;
  merchantName: string;
  merchantTin: string;
  name: string;
  systemNumber: string;
  city: string | null;
  region: string | null;
  createdAt: string;
}

/** Per-branch INSA certificate onboarding status. Mirrors
 *  {@link CertificateStatus} on the API. */
export interface CertificateStatus {
  hasPrivateKey: boolean;
  hasCsr: boolean;
  hasCert: boolean;
  submittedAt: string | null;
  issuedAt: string | null;
  usedByo: boolean;
  cert: {
    subjectCn: string | null;
    serial: string | null;
    notBefore: string | null;
    notAfter: string | null;
    lifecycle: "MISSING" | "NOT_YET_VALID" | "VALID" | "EXPIRING" | "EXPIRED";
    daysUntilExpiry: number | null;
  };
  form: {
    contactFullName: string | null;
    contactJobTitle: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    reason: string | null;
  };
  submissionEmail: string;
}

export interface LoginResponse {
  /** Short-lived access JWT (5 min). The long-lived refresh token rides in
   *  the `eirms_refresh` HttpOnly cookie set by the same response — it is
   *  intentionally never visible to JavaScript on the wire. */
  token: string;
  expiresIn: number;
  user: AuthUser;
}

export interface PendingAuthResponse {
  step: "email-verification" | "two-factor";
  pendingToken: string;
  email: string;
  phone: string | null;
  deliveryFailed?: boolean;
}

/** Branch shape inside MeContext — same as SafeBranch but with the *Set
 *  credential booleans removed (the caller doesn't need credential status to
 *  render their own receipt; that's a Phase D onboarding concern). */
export type MeBranch = Omit<
  SafeBranch,
  "eirmsClientIdSet" | "eirmsClientSecretSet" | "eirmsApikeySet"
>;

/** A branch the caller may switch to. `hasCreds`/`hasCert` badge cards so
 *  the merchant admin sees at a glance which branches are ready to invoice. */
export interface AvailableBranch extends MeBranch {
  hasCreds: boolean;
  hasCert: boolean;
}

/** `GET /auth/me/context` payload — used by the SPA at boot to render the
 *  shell, PDFs, and POS receipts with the caller's seller details. */
export interface MeContext {
  user: AuthUser;
  merchant: Merchant | null;
  activeBranch: MeBranch | null;
  availableBranches: AvailableBranch[];
}

export interface DashboardPeriod {
  invoices: number;
  revenue: number;
  receipts: number;
  collected: number;
}

export interface DashboardSummary {
  today: DashboardPeriod;
  thisMonth: DashboardPeriod;
  lastMonth: DashboardPeriod;
  allTime: DashboardPeriod;
  outstanding: { count: number; total: number };
  activeUsers: number;
  recentInvoices: Array<{
    id: string;
    irn: string;
    documentNumber: string;
    documentType: string;
    transactionType: string;
    status: "ACCEPTED" | "CANCELLED";
    paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
    totalValue: number;
    currency: string;
    createdAt: string;
    buyer: { legalName: string; tin: string };
  }>;
  recentReceipts: Array<{
    id: string;
    receiptNumber: string;
    receiptCounter: number;
    kind: "SALES" | "WITHHOLD";
    collectedAmount: number;
    receiptCurrency: string;
    modeOfPayment: string | null;
    createdAt: string;
  }>;
  topBuyers: Array<{
    buyerId: string;
    legalName: string;
    tin: string;
    invoiceCount: number;
    totalValue: number;
  }>;
  inventoryAlerts: Array<{
    code: string;
    description: string;
    onHand: number;
    lowStockThreshold: number;
  }>;
  eirmsCompliance: {
    configured: boolean;
    invoicesRegistered: number;
    pending: number;
    failed: number;
  };
}

/** Platform-wide aggregate for the SUPER_ADMIN. Counts + a top-merchants
 *  leaderboard by document volume — no per-merchant revenue or buyer detail. */
export interface SystemSummary {
  merchants: {
    total: number;
    active: number;
    pending: number;
    rejected: number;
    suspended: number;
  };
  tenants: {
    totalBranches: number;
    activeBranches: number;
    activeUsers: number;
  };
  documents: {
    invoicesToday: number;
    invoicesThisMonth: number;
    invoicesAllTime: number;
    receiptsAllTime: number;
  };
  platformActivity: {
    receiptsToday: number;
    failedInvoices: number;
    pendingInvoices: number;
    cancelledInvoices: number;
  };
  registrationReviews: {
    pending: number;
    emailVerified: number;
    emailNotVerified: number;
    approved: number;
    rejected: number;
  };
  pendingMerchantList: Array<{
    id: string;
    legalName: string;
    tin: string;
    email: string | null;
    createdAt: string;
    ownerEmail: string | null;
    ownerName: string | null;
    mainBranch: {
      id: string;
      name: string;
      city: string | null;
      region: string | null;
    } | null;
  }>;
  recentAuditLogs: Array<{
    id: string;
    action: string;
    actorEmail: string | null;
    summary: string | null;
    success: boolean;
    createdAt: string;
  }>;
  topMerchants: Array<{
    merchantId: string;
    legalName: string;
    invoiceCount: number;
  }>;
}

export type LegalDocumentStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface RegistrationReview {
  merchantId: string;
  merchantName: string;
  tin: string;
  phone: string | null;
  registeredAt: string;
  applicant: {
    id: string;
    name: string | null;
    email: string;
    emailVerifiedAt: string | null;
    phone: string | null;
    phoneVerifiedAt: string | null;
  };
  document: {
    id: string;
    originalName: string;
    mediaType: string;
    sizeBytes: number;
    status: LegalDocumentStatus;
    uploadedAt: string;
    reviewedBy: string | null;
    reviewer: { name: string | null; email: string } | null;
    reviewedAt: string | null;
    rejectionReason: string | null;
  };
}

export interface SystemHealthSummary {
  status: "ok" | "degraded";
  checks: {
    db: {
      status: "ok" | "down" | "skipped";
      message?: string;
      latencyMs?: number;
    };
    redis: {
      status: "ok" | "down" | "skipped";
      message?: string;
      latencyMs?: number;
    };
    vault: {
      status: "ok" | "down" | "skipped";
      message?: string;
      latencyMs?: number;
    };
    eirms: {
      status: "ok" | "down" | "skipped";
      message?: string;
      latencyMs?: number;
    };
    queueWorker: {
      status: "ok" | "down" | "skipped";
      message?: string;
      latencyMs?: number;
    };
  };
  queue: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  security: {
    failedLogins: number;
    lockedAccounts: number;
  };
}

export interface CashierSummary {
  today: {
    transactions: number;
    sales: number;
    itemsSold: number;
  };
  paymentSummary: {
    cash: number;
    credit: number;
    advance: number;
  };
  recentInvoices: Array<{
    id: string;
    irn: string;
    documentNumber: string;
    documentType: string;
    /** B2C | B2B | B2G — shown on the cashier invoice list. */
    transactionType: string;
    status: string;
    paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
    totalValue: number;
    currency: string;
    createdAt: string;
    buyer: { legalName: string; tin: string };
  }>;
}

export interface AccountantSummary {
  invoiced: number;
  collected: number;
  outstanding: number;
  withholding: number;
  recentReceipts: Array<{
    id: string;
    receiptNumber: string;
    receiptCounter: number;
    kind: string;
    collectedAmount: number;
    receiptCurrency: string;
    modeOfPayment: string | null;
    createdAt: string;
  }>;
  outstandingInvoices: Array<{
    id: string;
    documentNumber: string;
    buyerLegalName: string;
    totalValue: number;
    paidAmount: number;
  }>;
}

export type ConsentScope =
  | "DASHBOARD"
  | "INVOICES"
  | "RECEIPTS"
  | "INVENTORY"
  | "INVENTORY_EDIT"
  | "USERS_EDIT";

export type ConsentStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "REVOKED"
  | "EXPIRED";

/** A cross-tenant access grant. Mirrors the API's SafeConsentGrant (never
 *  carries the tokenHash). */
export interface ConsentGrant {
  id: string;
  superAdminId: string;
  merchantId: string;
  scopes: ConsentScope[];
  status: ConsentStatus;
  proposedMinutes: number;
  grantedMinutes: number | null;
  expiresAt: string | null;
  linkExpiresAt: string;
  decidedByUserId: string | null;
  decidedAt: string | null;
  revokedByUserId: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Decision-page payload — the grant plus display context. */
export interface ConsentDecision extends ConsentGrant {
  merchantName: string;
  requesterEmail: string;
}

export interface Buyer {
  id: string;
  tin: string;
  legalName: string;
  email: string | null;
  phone: string | null;
  vatNumber: string | null;
  idType: string | null;
  idNumber: string | null;
  houseNumber: string | null;
  region: string | null;
  country: string | null;
  zone: string | null;
  kebele: string | null;
  wereda: string | null;
  city: string | null;
  language: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AuditDirection = "INBOUND" | "OUTBOUND";

export interface AuditLog {
  id: string;
  direction: AuditDirection;
  action: string;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: UserRole | null;
  method: string | null;
  path: string | null;
  entityType: string | null;
  entityId: string | null;
  statusCode: number | null;
  success: boolean;
  summary: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  /** Present only on the detail endpoint (omitted from list responses). */
  requestBody?: unknown;
  responseBody?: unknown;
}

export interface AuditLogPage {
  items: AuditLog[];
  total: number;
  limit: number;
  offset: number;
}

export interface InventoryItem {
  id: string;
  code: string;
  sku: string | null;
  /** UPC / EAN / GTIN — the barcode number on the physical package. Enables
   *  the barcode-scan sale flow. */
  upc: string | null;
  description: string;
  longDescription: string | null;
  imageUrl: string | null;
  categoryId: string | null;
  unit: string;
  unitPrice: number;
  taxCode: string;
  taxRate: number;
  /** MoR Harmonized-System code. Paired with excise on register — a line with
   *  ExciseTaxValue > 0 must resolve a HC or the server refuses the payload. */
  harmonizationCode: string | null;
  /** Ad-valorem excise rate, percent of unit price. Line excise on register
   *  is `qty * unitPrice * exciseRate / 100`. Null = non-excisable. */
  exciseRate: number | null;
  nature: "goods" | "service";
  active: boolean;
  trackStock: boolean;
  /** On-hand across the active branch's stores. Null when no branch is
   *  selected — the catalogue is merchant-wide, stock is not. */
  onHand: number | null;
  /** On-hand across every store in the merchant. Read-only rollup. */
  totalOnHand: number;
  /** On the branch's sales-floor store only — what the till can sell, and
   *  what the stock gate checks. Lower than `onHand` when the branch keeps a
   *  back room, so the POS must show this rather than `onHand`. */
  sellable: number | null;
  lowStockThreshold: number | null;
  predecessorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryCategory {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryPage {
  items: InventoryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type StockMovementReason =
  | "SALE"
  | "ADJUSTMENT"
  | "RESTOCK"
  | "SUPERSEDE"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "DAMAGE"
  | "EXPIRY"
  | "THEFT"
  | "INTERNAL_USE";

export interface StockMovement {
  id: string;
  inventoryItemId: string;
  delta: number;
  reason: StockMovementReason;
  note: string | null;
  refType: string | null;
  refId: string | null;
  actorEmail: string | null;
  createdAt: string;
  storeId: string | null;
  purchaseItemId: string | null;
}

export interface Store {
  id: string;
  merchantId: string;
  branchId: string;
  name: string;
  code: string;
  isDefault: boolean;
  isSalesFloor: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Merchant-maintained HS-code lookup. Items copy `code` + `exciseRate` onto
 *  their own row when one is picked, so editing this table never rewrites the
 *  rate a past invoice was registered with. */
export interface HarmonizationCode {
  id: string;
  merchantId: string;
  code: string;
  description: string | null;
  exciseRate: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Vendor {
  id: string;
  merchantId: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  tin: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockPurchaseItem {
  id: string;
  purchaseId: string;
  inventoryItemId: string;
  storeId: string;
  quantity: number;
  unitCost: number;
  lineCost: number;
}

export interface StockPurchase {
  id: string;
  merchantId: string;
  branchId: string;
  vendorId: string | null;
  vendor: Vendor | null;
  reference: string | null;
  purchaseDate: string;
  totalCost: number;
  currency: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  items: StockPurchaseItem[];
}

export type InvoiceStatus = "ACCEPTED" | "CANCELLED";
export type InvoicePaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

export interface InvoiceLine {
  id: string;
  lineNumber: number;
  itemCode: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxCode: string;
  taxRate: number | null;
  taxType: "STANDARD" | "ZERO_RATED" | "EXEMPT" | "OTHER" | null;
  taxAmount: number;
  preTaxValue: number;
  totalAmount: number;
  inventoryItemId: string | null;
}

export interface InvoiceCancellation {
  id: string;
  reasonCode: string;
  remark: string | null;
  ackDate: string | null;
  createdAt: string;
}

export interface VerifyInvoiceBody {
  Irn: string;
  Status: string;
  TransactionType: string;
  Version: string;
  DocumentDetails?: {
    Type: string;
    DocumentNumber: string;
    Date: string;
  };
  SourceSystem?: {
    SystemType: string;
    SystemNumber: string;
    InvoiceCounter: number;
    CashierName: string;
    SalesPersonName: string;
  };
  SellerDetails?: Record<string, unknown>;
  BuyerDetails?: Record<string, unknown>;
  ItemList?: Array<Record<string, unknown>>;
  ValueDetails?: {
    TotalValue: number;
    TaxValue: number;
    ExciseValue: number;
    TransactionWithholdValue: number;
    IncomeWithholdValue: number;
    InvoiceCurrency: string;
  };
  PaymentDetails?: { Mode: string; PaymentTerm: string };
  ReferenceDetails?: Record<string, unknown>;
}

export interface VerifyInvoiceEnvelope {
  statusCode: number;
  message: string;
  body: VerifyInvoiceBody | null;
}

export interface VerifyInvoiceFlat {
  message: string;
  status: string;
}

export type VerifyResponse = VerifyInvoiceEnvelope | VerifyInvoiceFlat;

export function isVerifyEnvelope(
  r: VerifyResponse,
): r is VerifyInvoiceEnvelope {
  return "body" in r && "statusCode" in r;
}

export interface Invoice {
  id: string;
  irn: string;
  documentNumber: string;
  documentType: string;
  documentDate: string;
  ackDate: string;
  status: InvoiceStatus;
  eirmsStatus: string;
  signedQR: string;
  signedInvoice: string;
  preTaxValue: number;
  taxValue: number;
  totalValue: number;
  withholdValue: number;
  withholdingRate: number | null;
  withholdingBase: number | null;
  withholdingThreshold: number | null;
  currency: string;
  transactionType: string;
  natureOfSupplies: string;
  paymentMode: string;
  paymentTerm: string;
  cashierName: string;
  salespersonName: string;
  invoiceCounter: number;
  createdAt: string;
  paymentStatus: InvoicePaymentStatus;
  paidAmount: number;
  /** For CRE / DEB: the IRN of the document this one amends. */
  relatedIrn: string | null;
  buyer: Buyer;
  items: InvoiceLine[];
  cancellation: InvoiceCancellation | null;
  /** Issuing branch + merchant. Print from these, never from the active
   *  branch — see {@link sellerInfoFromDocument}. */
  branch?: DocumentBranchIdentity | null;
  merchant?: DocumentMerchantIdentity | null;
  /**
   * Stored MoR register-request payload — the exact body we POSTed at
   * issuance. Used to (a) recover a memo's original IRN, and (b) forward
   * `BuyerDetails` verbatim on credit/debit memos so MoR's strict
   * related-document equality check doesn't trip on a re-derived buyer
   * shape (e.g. a default `IdType` injection or key-order drift).
   *
   * Typed loosely on purpose — the full server-side shape isn't worth
   * mirroring in the SPA. Anything not declared here is still on the
   * wire and accessible via `rawRequest as Record<string, unknown>`.
   */
  rawRequest?: {
    ReferenceDetails?: { RelatedDocument?: string | null } | null;
    BuyerDetails?: Record<string, unknown> | null;
    ItemList?: Array<Record<string, unknown>> | null;
  } | null;
  /** Where this invoice came from:
   *  - `EIRMS` — registered through this platform's POS flow.
   *  - `EXTERNAL` — issued elsewhere and imported by IRN via MoR's
   *    /v1/verify so a receipt can be filed against it; signedQR /
   *    signedInvoice / ackDate are empty on these rows. */
  source?: "EIRMS" | "EXTERNAL";
}

/**
 * Offline-issued invoice awaiting sync with MoR. Mirrors the API's
 * `InvoiceDraft` row shape (no payload — the SPA gets the denormalised
 * summary columns only). Drafts live in their own list section above
 * the issued-invoices table.
 *
 * `relatedIrn` is set on CRE / DEB drafts (the original invoice's IRN);
 * unsynced parents can't be referenced by a memo draft (API enforces).
 */
export interface InvoiceDraft {
  id: string;
  provisionalDocumentNumber: string;
  documentType: "INV" | "CRE" | "DEB";
  transactionType: "B2B" | "B2C" | "B2G";
  buyerTin: string | null;
  buyerLegalName: string;
  totalValue: number;
  currency: string;
  cashierName: string;
  salespersonName: string;
  relatedIrn: string | null;
  /** PENDING — waiting to be synced. SYNCING — in flight (mutex against
   *  concurrent triggers). SYNC_FAILED — last attempt rejected; the
   *  cashier sees `lastError` and can retry. */
  status: "PENDING" | "SYNCING" | "SYNC_FAILED";
  lastError: string | null;
  lastAttemptAt: string | null;
  attempts: number;
  merchantId: string;
  branchId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptInvoiceLine {
  id: string;
  paymentCoverage: "FULL" | "PARTIAL" | "WITHHOLD";
  invoicePaidAmount: number;
  discountAmount: number | null;
  remainingAmount: number | null;
  totalAmount: number;
  invoice: Invoice;
}

export type ReceiptKind = "SALES" | "WITHHOLD";

export interface Receipt {
  id: string;
  kind: ReceiptKind;
  /** Issuing branch + merchant. Print from these, never from the active
   *  branch — see {@link sellerInfoFromDocument}. */
  branch?: DocumentBranchIdentity | null;
  merchant?: DocumentMerchantIdentity | null;
  receiptNumber: string;
  receiptType: string;
  receiptDate: string;
  receiptCounter: number;
  manualReceiptNumber: string | null;
  reason: string | null;
  collectedAmount: number;
  receiptCurrency: string;
  exchangeRate: number | null;
  withholdType: string | null;
  withholdRate: number | null;
  withholdPreTax: number | null;
  withholdAmount: number | null;
  externalInvoiceIrn: string | null;
  // Supplier identity captured on the withhold form (all null for SALES).
  supplierLegalName: string | null;
  supplierTin: string | null;
  supplierSubTin: string | null;
  supplierVatNumber: string | null;
  supplierPhone: string | null;
  supplierEmail: string | null;
  supplierCity: string | null;
  supplierZone: string | null;
  supplierWereda: string | null;
  supplierKebele: string | null;
  eirmsId: number | null;
  rrn: string | null;
  signedQR: string | null;
  eirmsStatus: string | null;
  modeOfPayment: string | null;
  paymentClassification: string | null;
  collectorName: string | null;
  paymentServiceProvider: string | null;
  otherPaymentServiceProviderName: string | null;
  chequeNumber: string | null;
  cpoNumber: string | null;
  documentNumber: string | null;
  accountNumber: string | null;
  transactionNumber: string | null;
  createdAt: string;
  invoices: ReceiptInvoiceLine[];
}

// Public SLA status page (GET /status). Mirrors the API's status.types.ts.
export type ComponentState = "operational" | "degraded" | "down";

export interface ComponentStatus {
  key: string;
  name: string;
  description: string;
  state: ComponentState;
  latencyMs?: number;
}

export interface StatusReport {
  status: ComponentState;
  updatedAt: string;
  components: ComponentStatus[];
}
