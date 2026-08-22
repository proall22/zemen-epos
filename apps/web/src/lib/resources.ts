import { API_BASE, ApiError, api, apiBlob } from "./api";
import type {
  AssignableRole,
  AuditDirection,
  AuditLog,
  AuditLogPage,
  AuthUser,
  Buyer,
  DashboardSummary,
  Invoice,
  InvoiceDraft,
  InventoryItem,
  InventoryCategory,
  InventoryPage,
  ItemStockRow,
  LoginResponse,
  PendingAuthResponse,
  ManagedUser,
  MeContext,
  Merchant,
  MerchantExport,
  Receipt,
  RegistrationReview,
  LegalDocumentStatus,
  SafeBranch,
  StatusReport,
  ConsentDecision,
  ConsentGrant,
  ConsentScope,
  HarmonizationCode,
  StockPurchase,
  Store,
  StoreStockRow,
  StockMovementPage,
  StockMovementReason,
  SystemHealthSummary,
  CashierSummary,
  AccountantSummary,
  SystemSummary,
  Vendor,
  VerifyResponse,
} from "./types";

export function loginRequest(
  email: string,
  password: string,
  turnstileToken?: string,
): Promise<PendingAuthResponse> {
  return api<PendingAuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, turnstileToken }),
  });
}

export function forgotPasswordRequest(
  email: string,
  turnstileToken?: string,
): Promise<{ ok: true }> {
  return api<{ ok: true }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email, turnstileToken }),
  });
}

export function resetPasswordRequest(
  token: string,
  password: string,
): Promise<{ ok: true }> {
  return api<{ ok: true }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

export function updatePreferences(input: {
  language: string;
}): Promise<AuthUser> {
  return api<AuthUser>("/auth/me/preferences", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// ---------- i18n management (SUPER_ADMIN) --------------------------------

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  active: boolean;
  ordering: number;
  createdAt: string;
  updatedAt: string;
}

export interface TranslationKeyRow {
  key: string;
  base: string;
  reference: string;
  override?: string;
  source: "base" | "override";
}

export function listLanguagesPublic(): Promise<Language[]> {
  return api<Language[]>("/i18n/languages");
}

export function listLanguagesAdmin(): Promise<Language[]> {
  return api<Language[]>("/admin/i18n/languages");
}

export function createLanguage(input: {
  code: string;
  name: string;
  nativeName: string;
  active?: boolean;
  ordering?: number;
}): Promise<Language> {
  return api<Language>("/admin/i18n/languages", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateLanguage(
  code: string,
  input: Partial<{
    name: string;
    nativeName: string;
    active: boolean;
    ordering: number;
  }>,
): Promise<Language> {
  return api<Language>(`/admin/i18n/languages/${code}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteLanguage(code: string): Promise<Language> {
  return api<Language>(`/admin/i18n/languages/${code}`, { method: "DELETE" });
}

export function listTranslationKeys(input: {
  language: string;
  missingOnly?: boolean;
  search?: string;
}): Promise<TranslationKeyRow[]> {
  const params = new URLSearchParams({ language: input.language });
  if (input.missingOnly) params.set("missingOnly", "true");
  if (input.search) params.set("search", input.search);
  return api<TranslationKeyRow[]>(`/admin/i18n/keys?${params}`);
}

export function upsertTranslationOverride(input: {
  language: string;
  key: string;
  value: string;
}): Promise<unknown> {
  return api<unknown>(
    `/admin/i18n/keys/${encodeURIComponent(input.language)}/${encodeURIComponent(input.key)}`,
    { method: "PATCH", body: JSON.stringify({ value: input.value }) },
  );
}

export function deleteTranslationOverride(input: {
  language: string;
  key: string;
}): Promise<{ ok: true }> {
  return api<{ ok: true }>(
    `/admin/i18n/keys/${encodeURIComponent(input.language)}/${encodeURIComponent(input.key)}`,
    { method: "DELETE" },
  );
}

export function fetchMe(): Promise<AuthUser> {
  return api<AuthUser>("/auth/me");
}

/** Revoke the current refresh cookie. The server reads the `eirms_refresh`
 *  HttpOnly cookie (sent via `credentials: "include"`), revokes the token,
 *  and clears the cookie. Idempotent — a 4xx is also fine, never reveal
 *  whether the cookie was valid. */
export function logoutRequest(): Promise<{ ok: true }> {
  return api<{ ok: true }>("/auth/logout", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function fetchMeContext(): Promise<MeContext> {
  return api<MeContext>("/auth/me/context");
}

export function getDashboardSummary(opts?: {
  scope?: "branch" | "merchant";
}): Promise<DashboardSummary> {
  const q = opts?.scope === "merchant" ? "?scope=merchant" : "";
  return api<DashboardSummary>(`/dashboard${q}`);
}

/** Platform-wide aggregate for the SUPER_ADMIN (no consent required). */
export function getSystemSummary(): Promise<SystemSummary> {
  return api<SystemSummary>("/dashboard/system");
}

export function getSystemHealthSummary(): Promise<SystemHealthSummary> {
  return api<SystemHealthSummary>("/dashboard/system/health");
}

export function listRegistrationReviews(
  status?: LegalDocumentStatus,
): Promise<RegistrationReview[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return api<RegistrationReview[]>(`/platform/registrations${query}`);
}

export function getRegistrationStatus(
  merchantId: string,
): Promise<RegistrationReview> {
  return api<RegistrationReview>(
    `/merchants/${encodeURIComponent(merchantId)}/registration-status`,
  );
}

export function openRegistrationDocument(
  merchantId: string,
): Promise<{ blob: Blob; filename: string | null }> {
  return apiBlob(
    `/platform/registrations/${encodeURIComponent(merchantId)}/document`,
  );
}

export function replaceRegistrationDocument(
  merchantId: string,
  document: File,
): Promise<RegistrationReview> {
  const form = new FormData();
  form.append("legalDocument", document);
  return api<RegistrationReview>(
    `/merchants/${encodeURIComponent(merchantId)}/registration-document`,
    { method: "POST", body: form },
  );
}

export function getCashierSummary(opts?: {
  scope?: "branch" | "merchant";
}): Promise<CashierSummary> {
  const q = opts?.scope === "merchant" ? "?scope=merchant" : "";
  return api<CashierSummary>(`/dashboard/cashier${q}`);
}

export function getAccountantSummary(opts?: {
  scope?: "branch" | "merchant";
}): Promise<AccountantSummary> {
  const q = opts?.scope === "merchant" ? "?scope=merchant" : "";
  return api<AccountantSummary>(`/dashboard/accountant${q}`);
}

// ----- Consent (cross-tenant access) ---------------------------------------

/** SUPER_ADMIN: request time-limited scoped access to a merchant. */
export function requestConsent(input: {
  merchantId: string;
  scopes: ConsentScope[];
  proposedMinutes: number;
}): Promise<ConsentGrant> {
  return api<ConsentGrant>("/consent/requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** SUPER_ADMIN: my own grants (pending / active / decided). */
export function listMyConsentGrants(): Promise<ConsentGrant[]> {
  return api<ConsentGrant[]>("/consent/requests");
}

/** Merchant admin: decision-page payload for a magic-link token. */
export function getConsentDecision(token: string): Promise<ConsentDecision> {
  return api<ConsentDecision>(`/consent/requests/${encodeURIComponent(token)}`);
}

/** Merchant admin: approve, choosing a window ≤ what was proposed. */
export function acceptConsent(
  token: string,
  grantedMinutes: number,
): Promise<ConsentGrant> {
  return api<ConsentGrant>(
    `/consent/requests/${encodeURIComponent(token)}/accept`,
    { method: "POST", body: JSON.stringify({ grantedMinutes }) },
  );
}

/** Merchant admin: decline the request. */
export function rejectConsent(token: string): Promise<ConsentGrant> {
  return api<ConsentGrant>(
    `/consent/requests/${encodeURIComponent(token)}/reject`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

/** Merchant admin: grants targeting their merchant (who has platform access). */
export function listGrantsForMerchant(): Promise<ConsentGrant[]> {
  return api<ConsentGrant[]>("/consent/granted");
}

/** Merchant admin: cut off an active/pending grant early. */
export function revokeConsent(grantId: string): Promise<ConsentGrant> {
  return api<ConsentGrant>(
    `/consent/granted/${encodeURIComponent(grantId)}/revoke`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export interface AuditQuery {
  direction?: AuditDirection;
  action?: string;
  actorEmail?: string;
  q?: string;
  success?: boolean;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
  branchId?: string;
}

export interface EmailEventRow {
  id: string;
  providerId: string;
  recipient: string;
  recipientDomain: string;
  subject: string | null;
  status: string;
  bouncedAt: string | null;
  complainedAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  bounceReason: string | null;
  createdAt: string;
}

export interface EmailDomainRow {
  domain: string;
  kind: "consumer" | "corporate";
  sent: number;
  delivered: number;
  opened: number;
  bounced: number;
  complained: number;
  deliverabilityRate: number;
  bounceRate: number;
}

export function listEmailEvents(
  query: {
    domain?: string;
    status?: string;
  } = {},
): Promise<EmailEventRow[]> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return api<EmailEventRow[]>(`/email-events${qs ? `?${qs}` : ""}`);
}

export function listEmailDomains(): Promise<EmailDomainRow[]> {
  return api<EmailDomainRow[]>("/email-events/by-domain");
}

export function listAuditLogs(query: AuditQuery = {}): Promise<AuditLogPage> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return api<AuditLogPage>(`/audit${qs ? `?${qs}` : ""}`);
}

export function getAuditLog(id: string): Promise<AuditLog> {
  return api<AuditLog>(`/audit/${id}`);
}

export function listUsers(): Promise<ManagedUser[]> {
  return api<ManagedUser[]>("/users");
}

export interface CreateUserInput {
  email: string;
  password: string;
  name?: string;
  role: AssignableRole;
  /** Optional — super-admin can target a specific merchant. Merchant admins
   *  always create within their own merchant; the server ignores any other
   *  value they pass. */
  merchantId?: string;
  /** Branch grants — the set of branches this user may act as. Ignored for
   *  MERCHANT_ADMIN (implicit access). */
  branchIds?: string[];
  /** Pinned default branch. Auto-selected on login; must be in branchIds. */
  branchId?: string | null;
}

export function createUser(input: CreateUserInput): Promise<ManagedUser> {
  return api<ManagedUser>("/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface UpdateUserInput {
  name?: string;
  role?: AssignableRole;
  active?: boolean;
  password?: string;
  /** Replace the user's branch grants. `undefined` leaves them alone; `[]`
   *  clears all grants; a list replaces. Ignored for MERCHANT_ADMIN. */
  branchIds?: string[];
  /** Pinned default. `null` clears; `<branchId>` sets; `undefined` leaves. */
  branchId?: string | null;
}

export function updateUser(
  id: string,
  input: UpdateUserInput,
): Promise<ManagedUser> {
  return api<ManagedUser>(`/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** Clear a brute-force lockout on a user without rotating their password. */
export function unlockUser(id: string): Promise<ManagedUser> {
  return api<ManagedUser>(`/users/${id}/unlock`, { method: "POST" });
}

export function listBuyers(): Promise<Buyer[]> {
  return api<Buyer[]>("/buyers");
}

export function listInventory(
  q?: string,
  categoryId?: string,
): Promise<InventoryItem[]> {
  const params = new URLSearchParams();
  if (q?.trim()) params.set("q", q.trim());
  if (categoryId) params.set("categoryId", categoryId);
  const query = params.toString();
  const path = `/inventory${query ? `?${query}` : ""}`;
  return api<InventoryItem[]>(path);
}

export function listInventoryPage(
  page: number,
  pageSize: number,
  q?: string,
  categoryId?: string,
): Promise<InventoryPage> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (q?.trim()) params.set("q", q.trim());
  if (categoryId) params.set("categoryId", categoryId);
  return api<InventoryPage>(`/inventory/page?${params}`);
}

export function listInventoryCategories(): Promise<InventoryCategory[]> {
  return api<InventoryCategory[]>("/inventory/categories");
}

export function createInventoryCategory(input: {
  name: string;
  description?: string;
}): Promise<InventoryCategory> {
  return api<InventoryCategory>("/inventory/categories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function uploadInventoryImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("image", file);
  const uploaded = await api<{ path: string }>("/inventory/images", {
    method: "POST",
    body: form,
  });
  // Store the stable API path in the database, not a deployment-specific
  // hostname. Image components resolve it through the current API base.
  return uploaded.path;
}

/** Exact-match barcode scan lookup (UPC > SKU > item code). Returns null on
 *  a 404 so the caller can chain to a fuzzy fallback without a try/catch. */
export async function scanInventory(
  code: string,
): Promise<InventoryItem | null> {
  try {
    return await api<InventoryItem>(
      `/inventory/scan/${encodeURIComponent(code.trim())}`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export interface CreateInventoryItemInput {
  code: string;
  sku?: string;
  upc?: string;
  description: string;
  longDescription?: string;
  imageUrl?: string;
  categoryId?: string;
  unit: string;
  unitPrice: number;
  /** The server derives `taxRate` from this — it is not accepted from clients,
   *  so a VAT15 item can't be saved carrying some other rate. */
  taxCode: string;
  harmonizationCode?: string;
  exciseRate?: number;
  nature?: "goods" | "service";
  trackStock?: boolean;
  stockQuantity?: number;
  lowStockThreshold?: number;
  /** Branch to scope the item to. Omit / null = merchant-wide (no per-store
   *  stock). Required for the item to participate in the multi-store system. */
  branchId?: string | null;
}

export interface ActiveTaxCode {
  id: string;
  code: string;
  name: string;
  rate: number;
  type: "STANDARD" | "ZERO_RATED" | "EXEMPT" | "OTHER";
}

export function listActiveTaxCodes(): Promise<ActiveTaxCode[]> {
  return api<ActiveTaxCode[]>("/system-configuration/active-tax-codes");
}

export function createInventoryItem(
  input: CreateInventoryItemInput,
): Promise<InventoryItem> {
  return api<InventoryItem>("/inventory", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type UpdateInventoryItemInput = Partial<CreateInventoryItemInput>;

export function updateInventoryItem(
  id: string,
  input: UpdateInventoryItemInput,
): Promise<InventoryItem> {
  return api<InventoryItem>(`/inventory/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** Replace an item with a new SKU (e.g. price change), keeping the link. */
export function supersedeInventoryItem(
  id: string,
  input: CreateInventoryItemInput,
): Promise<InventoryItem> {
  return api<InventoryItem>(`/inventory/${id}/supersede`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function adjustStock(
  id: string,
  input: {
    delta: number;
    reason?: "RESTOCK" | "ADJUSTMENT";
    note?: string;
    storeId?: string;
  },
): Promise<InventoryItem> {
  return api<InventoryItem>(`/inventory/${id}/stock-adjust`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type WriteOffReason = "DAMAGE" | "EXPIRY" | "THEFT" | "INTERNAL_USE";

export function writeOffInventoryItem(
  id: string,
  input: {
    quantity: number;
    reason: WriteOffReason;
    note: string;
    storeId?: string;
  },
): Promise<InventoryItem> {
  return api<InventoryItem>(`/inventory/${id}/write-off`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ----- Stores ---------------------------------------------------------------

/** `branchId` narrows to one branch. Without it the server scopes to the
 *  caller's active branch, which is wrong whenever the UI lets the user pick a
 *  branch (merchant admins span several). */
export function listStores(
  includeInactive = false,
  branchId?: string,
): Promise<Store[]> {
  const params = new URLSearchParams();
  if (includeInactive) params.set("includeInactive", "true");
  if (branchId) params.set("branchId", branchId);
  const q = params.toString();
  return api<Store[]>(`/stores${q ? `?${q}` : ""}`);
}

export interface CreateStoreInput {
  name: string;
  code: string;
  branchId: string;
  isSalesFloor?: boolean;
  active?: boolean;
}

export function createStore(input: CreateStoreInput): Promise<Store> {
  return api<Store>("/stores", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type UpdateStoreInput = Partial<Omit<CreateStoreInput, "branchId">>;

export function updateStore(
  id: string,
  input: UpdateStoreInput,
): Promise<Store> {
  return api<Store>(`/stores/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteStore(id: string): Promise<Store> {
  return api<Store>(`/stores/${id}`, { method: "DELETE" });
}

/** What one store is holding, with live POS reservations netted out. */
/** Physical stock take: set a store's on-hand to what was counted. Use to
 *  correct a drifted or negative balance — the server derives the delta and
 *  records it in the ledger. */
export function recordStockCount(
  itemId: string,
  input: { storeId: string; counted: number; note?: string },
): Promise<InventoryItem> {
  return api<InventoryItem>(`/inventory/${itemId}/stock-count`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listStoreStock(
  storeId: string,
  q?: string,
): Promise<StoreStockRow[]> {
  const query = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return api<StoreStockRow[]>(`/stores/${storeId}/stock${query}`);
}

/** Where one item is held, across the stores the caller can see. */
export function listItemStock(itemId: string): Promise<ItemStockRow[]> {
  return api<ItemStockRow[]>(`/inventory/${itemId}/stock`);
}

export interface MovementFilters {
  storeId?: string;
  inventoryItemId?: string;
  reason?: StockMovementReason;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export function listStockMovements(
  filters: MovementFilters = {},
): Promise<StockMovementPage> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== "") params.set(k, String(v));
  }
  const q = params.toString();
  return api<StockMovementPage>(`/stock-movements${q ? `?${q}` : ""}`);
}

export function transferStock(input: {
  fromStoreId: string;
  toStoreId: string;
  inventoryItemId: string;
  quantity: number;
  note?: string;
}): Promise<{ from: number; to: number }> {
  return api<{ from: number; to: number }>("/stores/transfers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ----- Harmonization codes --------------------------------------------------

export function listHarmonizationCodes(
  includeInactive = false,
): Promise<HarmonizationCode[]> {
  const q = includeInactive ? "?includeInactive=true" : "";
  return api<HarmonizationCode[]>(`/harmonization-codes${q}`);
}

export interface CreateHarmonizationCodeInput {
  code: string;
  description?: string;
  exciseRate?: number;
  active?: boolean;
}

export function createHarmonizationCode(
  input: CreateHarmonizationCodeInput,
): Promise<HarmonizationCode> {
  return api<HarmonizationCode>("/harmonization-codes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type UpdateHarmonizationCodeInput =
  Partial<CreateHarmonizationCodeInput>;

export function updateHarmonizationCode(
  id: string,
  input: UpdateHarmonizationCodeInput,
): Promise<HarmonizationCode> {
  return api<HarmonizationCode>(`/harmonization-codes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteHarmonizationCode(
  id: string,
): Promise<HarmonizationCode> {
  return api<HarmonizationCode>(`/harmonization-codes/${id}`, {
    method: "DELETE",
  });
}

// ----- Vendors --------------------------------------------------------------

export function listVendors(includeInactive = false): Promise<Vendor[]> {
  const q = includeInactive ? "?includeInactive=true" : "";
  return api<Vendor[]>(`/vendors${q}`);
}

export interface CreateVendorInput {
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  tin?: string;
  notes?: string;
  active?: boolean;
}

export function createVendor(input: CreateVendorInput): Promise<Vendor> {
  return api<Vendor>("/vendors", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type UpdateVendorInput = Partial<CreateVendorInput>;

export function updateVendor(
  id: string,
  input: UpdateVendorInput,
): Promise<Vendor> {
  return api<Vendor>(`/vendors/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteVendor(id: string): Promise<Vendor> {
  return api<Vendor>(`/vendors/${id}`, { method: "DELETE" });
}

// ----- Purchases ------------------------------------------------------------

export function listPurchases(opts?: {
  vendorId?: string;
}): Promise<StockPurchase[]> {
  const q = opts?.vendorId
    ? `?vendorId=${encodeURIComponent(opts.vendorId)}`
    : "";
  return api<StockPurchase[]>(`/purchases${q}`);
}

export function getPurchase(id: string): Promise<StockPurchase> {
  return api<StockPurchase>(`/purchases/${id}`);
}

export interface CreatePurchaseInput {
  branchId: string;
  vendorId?: string;
  reference?: string;
  purchaseDate: string;
  currency?: string;
  note?: string;
  items: Array<{
    inventoryItemId: string;
    storeId: string;
    quantity: number;
    unitCost: number;
  }>;
}

export function createPurchase(
  input: CreatePurchaseInput,
): Promise<StockPurchase> {
  return api<StockPurchase>("/purchases", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ----- POS reservations -----------------------------------------------------

export interface ReservationSummary {
  onHand: number;
  reserved: number;
  available: number;
}

export function upsertReservations(input: {
  cartSessionId: string;
  items: Array<{ inventoryItemId: string; quantity: number }>;
}): Promise<unknown> {
  return api<unknown>("/pos/reservations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function heartbeatReservations(
  cartSessionId: string,
): Promise<{ ok: true; expiresAt: string }> {
  return api<{ ok: true; expiresAt: string }>(
    `/pos/reservations/${cartSessionId}/heartbeat`,
    { method: "PATCH" },
  );
}

/** `branchId` pins the release to the branch the cart was built in. Without it
 *  a release fired after a branch switch targets the *new* branch and the old
 *  branch's holds sit until their TTL expires. */
export function releaseReservations(
  cartSessionId: string,
  branchId?: string,
): Promise<{ released: number }> {
  return api<{ released: number }>(`/pos/reservations/${cartSessionId}`, {
    method: "DELETE",
    ...(branchId ? { headers: { "X-Branch-Id": branchId } } : {}),
  });
}

/** Shared across the three document lists. Any field left undefined is
 *  simply not sent, so an empty object means "everything, first page". */
export interface DocumentFilters {
  scope?: "branch" | "merchant";
  from?: string;
  to?: string;
  q?: string;
  status?: string;
  kind?: "SALES" | "WITHHOLD";
  cursor?: string;
  limit?: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  /** Rows matching the filter, ignoring pagination. */
  total: number;
}

function filterQuery(f: DocumentFilters = {}): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const q = params.toString();
  return q ? `?${q}` : "";
}

export function listInvoices(f: DocumentFilters = {}): Promise<Page<Invoice>> {
  return api<Page<Invoice>>(`/invoices${filterQuery(f)}`);
}

export function getInvoiceChain(id: string): Promise<Invoice[]> {
  return api<Invoice[]>(`/invoices/${id}/chain`);
}

export interface NextSequence {
  documentNumber: string;
  invoiceCounter: number;
}

export function getNextSequence(): Promise<NextSequence> {
  return api<NextSequence>("/invoices/next-sequence");
}

export function getInvoice(id: string): Promise<Invoice> {
  return api<Invoice>(`/invoices/${id}`);
}

/** Resolve an invoice by its MoR-issued IRN. Used by the receipts page's
 *  "record payment by IRN" dialog. 404 → ApiError with status 404. */
export function findInvoiceByIrn(irn: string): Promise<Invoice> {
  return api<Invoice>(`/invoices/by-irn/${encodeURIComponent(irn)}`);
}

/** Import an externally-issued invoice into the local DB by IRN. The server
 *  asks MoR /v1/verify for the details and bootstraps a stub Invoice row
 *  marked `source: EXTERNAL`. Idempotent: a second call with the same IRN
 *  returns the previously-imported row. Cancelled invoices are refused
 *  (409). Used by the receipts page's "record payment by IRN" dialog as
 *  the fallback when the IRN isn't already in our records. */
export function importInvoiceByIrn(irn: string): Promise<Invoice> {
  return api<Invoice>("/invoices/import-from-irn", {
    method: "POST",
    body: JSON.stringify({ irn }),
  });
}

// ---------------------------------------------------------------------------
// Offline-mode drafts
// ---------------------------------------------------------------------------

/** Save an invoice as a draft (skips MoR). Same body the live register
 *  endpoint takes; on success returns the persisted draft row. */
export function createInvoiceDraft(
  body: Record<string, unknown>,
): Promise<InvoiceDraft> {
  return api<InvoiceDraft>("/invoices/draft", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listInvoiceDrafts(): Promise<InvoiceDraft[]> {
  return api<InvoiceDraft[]>("/invoices/drafts");
}

/** Push a draft to MoR. On success returns the resulting Invoice
 *  (the draft row is deleted server-side in the same call). */
export function syncInvoiceDraft(id: string): Promise<Invoice> {
  return api<Invoice>(`/invoices/drafts/${id}/sync`, { method: "POST" });
}

export function deleteInvoiceDraft(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/invoices/drafts/${id}`, { method: "DELETE" });
}

/** Buyer-facing fetch for the public printable invoice page (tokenized link
 *  from notification email/SMS). No login required. */
export function getPublicInvoice(id: string, token: string): Promise<Invoice> {
  return api<Invoice>(`/invoices/${id}/public?t=${encodeURIComponent(token)}`);
}

export function cancelInvoice(
  id: string,
  reasonCode: string,
  remark: string,
): Promise<Invoice> {
  return api<Invoice>(`/invoices/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reasonCode, remark }),
  });
}

export function verifyInvoice(id: string): Promise<VerifyResponse> {
  return api<VerifyResponse>(`/invoices/${id}/verify`, {
    method: "POST",
  });
}

/** Read-only IRN lookup against MoR /v1/verify — nothing is persisted. Powers
 *  the "check external invoice" dialog. Returns MoR's verify response. */
export function lookupExternalInvoice(irn: string): Promise<VerifyResponse> {
  return api<VerifyResponse>("/invoices/lookup-external", {
    method: "POST",
    body: JSON.stringify({ irn }),
  });
}

/** Verify a receipt with MoR (keyed by its RRN). Same /v1/verify envelope the
 *  invoice verify returns. */
export function verifyReceipt(id: string): Promise<VerifyResponse> {
  return api<VerifyResponse>(`/receipts/${id}/verify`, {
    method: "POST",
  });
}

export function listReceipts(f: DocumentFilters = {}): Promise<Page<Receipt>> {
  return api<Page<Receipt>>(`/receipts${filterQuery(f)}`);
}

export interface WithholdingRegister extends Page<Receipt> {
  /** Summed over the whole filter, not just the visible page. */
  withheldTotal: number;
  preTaxTotal: number;
}

export function getWithholdingRegister(
  f: DocumentFilters = {},
): Promise<WithholdingRegister> {
  return api<WithholdingRegister>(
    `/receipts/withholding-register${filterQuery(f)}`,
  );
}

export function getReceipt(id: string): Promise<Receipt> {
  return api<Receipt>(`/receipts/${id}`);
}

/** Buyer-facing fetch for the public printable receipt page (tokenized
 *  link from notification email). No login required; the server returns
 *  each linked invoice with its full line items so the page can render
 *  without authenticated round-trips. */
export function getPublicReceipt(id: string, token: string): Promise<Receipt> {
  return api<Receipt>(`/receipts/${id}/public?t=${encodeURIComponent(token)}`);
}

/**
 * Resolve the receipt that settled a given invoice. An invoice can be covered
 * by more than one receipt (partial payments); we return the most recent.
 * Resolved client-side since invoices carry no back-reference to their receipt.
 */
export async function findReceiptForInvoice(
  invoiceId: string,
): Promise<Receipt | null> {
  const receipts = await listReceipts({ limit: 200 });
  const matches = receipts.items
    .filter((r) => r.invoices.some((line) => line.invoice.id === invoiceId))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  return matches[0] ?? null;
}

export interface CreateReceiptInput {
  manualReceiptNumber?: string;
  reason?: string;
  collectedAmount: number;
  receiptCurrency?: string;
  exchangeRate?: number | null;
  invoices: Array<{
    invoiceId: string;
    paymentCoverage: "FULL" | "PARTIAL";
    invoicePaidAmount: number;
    discountAmount?: number | null;
    remainingAmount?: number | null;
    totalAmount: number;
  }>;
  transactionDetails: {
    paymentMode: "CASH" | "ADVANCE" | "CREDIT";
    modeOfPayment: string;
    collectorName: string;
    paymentServiceProvider?: string;
    otherPaymentServiceProviderName?: string;
    chequeNumber?: string;
    cpoNumber?: string;
    documentNumber?: string;
    accountNumber?: string;
    transactionNumber?: string;
  };
}

export function createReceipt(input: CreateReceiptInput): Promise<Receipt> {
  return api<Receipt>("/receipts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface CreateWithholdReceiptInput {
  reason?: string;
  invoiceDetail: {
    invoiceIrn: string;
    currency?: string;
    exchangeRate?: number | null;
  };
  withholdDetail: {
    type: "TWTH" | "IWTH";
    nature: "goods" | "service";
    rate?: number | null;
    preTaxAmount: number;
    withholdingAmount: number;
  };
  /** Supplier identity — the source invoice lives on the supplier's system,
   *  not ours, so the cashier fills these in on the form. All optional. */
  supplier?: {
    legalName?: string;
    tin?: string;
    subTin?: string;
    vatNumber?: string;
    phone?: string;
    email?: string;
    city?: string;
    zone?: string;
    wereda?: string;
    kebele?: string;
  };
}

export interface WithholdingCalculation {
  preTaxAmount: number;
  nature: "goods" | "service";
  rate: number;
  threshold: number;
  applicable: boolean;
  withholdingAmount: number;
  netPayable: number;
}

export function calculateWithholding(
  preTaxAmount: number,
  nature: "goods" | "service",
): Promise<WithholdingCalculation> {
  return api<WithholdingCalculation>(
    "/system-configuration/withholding/calculate",
    {
      method: "POST",
      body: JSON.stringify({ preTaxAmount, nature }),
    },
  );
}

export function createWithholdReceipt(
  input: CreateWithholdReceiptInput,
): Promise<Receipt> {
  return api<Receipt>("/receipts/withhold", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface NextWithholdSequence {
  receiptNumber: string;
  receiptCounter: number;
  receiptCounterFormatted: string;
}

export function getNextWithholdSequence(): Promise<NextWithholdSequence> {
  return api<NextWithholdSequence>("/receipts/withhold/next-sequence");
}

// ---------------------------------------------------------------------------
// Merchants + branches (Phase D)
// ---------------------------------------------------------------------------

export function listMerchants(): Promise<Merchant[]> {
  return api<Merchant[]>("/merchants");
}

export function getMerchant(id: string): Promise<Merchant> {
  return api<Merchant>(`/merchants/${id}`);
}

export interface MerchantInput {
  legalName: string;
  tradeName?: string | null;
  tin: string;
  email?: string | null;
  phone?: string | null;
  vatNumber?: string | null;
  city?: string | null;
  region?: string | null;
  zone?: string | null;
  wereda?: string | null;
  kebele?: string | null;
  houseNumber?: string | null;
  defaultLanguage?: string;
}

export function createMerchant(input: MerchantInput): Promise<Merchant> {
  return api<Merchant>("/merchants", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateMerchant(
  id: string,
  input: Partial<MerchantInput> & { active?: boolean },
): Promise<Merchant> {
  return api<Merchant>(`/merchants/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** Phase I — back-office reject action for a pending merchant. Optional
 *  short reason is included in the rejection email. */
export function rejectMerchant(id: string, reason?: string): Promise<Merchant> {
  return api<Merchant>(`/merchants/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function listBranches(merchantId: string): Promise<SafeBranch[]> {
  return api<SafeBranch[]>(`/merchants/${merchantId}/branches`);
}

export interface BranchStats {
  invoices: number;
  receipts: number;
  activeUsers: number;
  lastActivityAt: string | null;
}

export function getBranchStats(
  merchantId: string,
  branchId: string,
): Promise<BranchStats> {
  return api<BranchStats>(
    `/merchants/${merchantId}/branches/${branchId}/stats`,
  );
}

export interface EirmsConnectionTest {
  ok: true;
  tin: string;
  systemType: string;
  systemNumber: string;
}

export function testBranchEirmsConnection(
  merchantId: string,
  branchId: string,
): Promise<EirmsConnectionTest> {
  return api<EirmsConnectionTest>(
    `/merchants/${merchantId}/branches/${branchId}/eirms/test`,
    { method: "POST" },
  );
}

export interface BranchInput {
  name: string;
  systemNumber?: string | null;
  city?: string | null;
  region?: string | null;
  zone?: string | null;
  wereda?: string | null;
  kebele?: string | null;
  houseNumber?: string | null;
  subTin?: string | null;
  tradeName?: string | null;
  vatNumber?: string | null;
  country?: string | null;
  stockPolicy?: "ALLOW_NEGATIVE" | "BLOCK_ON_EMPTY";
  eirmsClientId?: string;
  eirmsClientSecret?: string;
  eirmsApikey?: string;
  /** Phase H — optional pin coords. Null on the update path clears, undefined
   *  leaves unchanged, number sets a new value. */
  latitude?: number | null;
  longitude?: number | null;
}

export function createBranch(
  merchantId: string,
  input: BranchInput,
): Promise<SafeBranch> {
  return api<SafeBranch>(`/merchants/${merchantId}/branches`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function approveBranch(
  merchantId: string,
  branchId: string,
): Promise<SafeBranch> {
  return api<SafeBranch>(
    `/merchants/${merchantId}/branches/${branchId}/approve`,
    { method: "POST" },
  );
}

export function listPendingBranchReviews(): Promise<
  import("./types").PendingBranchReview[]
> {
  return api<import("./types").PendingBranchReview[]>(
    "/platform/branch-approvals",
  );
}

export function rejectBranch(
  merchantId: string,
  branchId: string,
  reason?: string,
): Promise<SafeBranch> {
  return api<SafeBranch>(
    `/merchants/${merchantId}/branches/${branchId}/reject`,
    {
      method: "POST",
      body: JSON.stringify(reason ? { reason } : {}),
    },
  );
}

export function updateBranch(
  merchantId: string,
  branchId: string,
  input: Partial<BranchInput> & { active?: boolean },
): Promise<SafeBranch> {
  return api<SafeBranch>(`/merchants/${merchantId}/branches/${branchId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Per-branch INSA certificate onboarding.
// ---------------------------------------------------------------------------

export interface CertificateFormInput {
  contactFullName?: string;
  contactJobTitle?: string;
  contactEmail?: string;
  contactPhone?: string;
  reason?: string;
}

export interface UploadPemInput {
  certPem: string;
  /** BYO path: supply the private key alongside the cert. Discouraged;
   *  hidden behind a UI toggle with a "not advised" warning. */
  privateKeyPem?: string;
}

export function getCertificateStatus(
  merchantId: string,
  branchId: string,
): Promise<import("./types").CertificateStatus> {
  return api<import("./types").CertificateStatus>(
    `/merchants/${merchantId}/branches/${branchId}/certificate`,
  );
}

export function updateCertificateForm(
  merchantId: string,
  branchId: string,
  input: CertificateFormInput,
): Promise<import("./types").CertificateStatus> {
  return api<import("./types").CertificateStatus>(
    `/merchants/${merchantId}/branches/${branchId}/certificate/form`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function markCertificateSubmitted(
  merchantId: string,
  branchId: string,
): Promise<import("./types").CertificateStatus> {
  return api<import("./types").CertificateStatus>(
    `/merchants/${merchantId}/branches/${branchId}/certificate/submit`,
    { method: "POST" },
  );
}

export function uploadCertificatePem(
  merchantId: string,
  branchId: string,
  input: UploadPemInput,
): Promise<import("./types").CertificateStatus> {
  return api<import("./types").CertificateStatus>(
    `/merchants/${merchantId}/branches/${branchId}/certificate/pem`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

/** Trigger a browser download from an authenticated endpoint. Handles the
 *  "no <a href> because we need the JWT" wart the rest of the app already
 *  works around with apiBlob. */
async function downloadFromApi(
  path: string,
  fallbackFilename: string,
): Promise<void> {
  const { blob, filename } = await apiBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? fallbackFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCertificateCsr(
  merchantId: string,
  branchId: string,
): Promise<void> {
  return downloadFromApi(
    `/merchants/${merchantId}/branches/${branchId}/certificate/request.csr`,
    "request.csr",
  );
}

export function downloadCertificateDocx(
  merchantId: string,
  branchId: string,
): Promise<void> {
  return downloadFromApi(
    `/merchants/${merchantId}/branches/${branchId}/certificate/request-form.docx`,
    "CERTIFICATE REQUEST FORM.docx",
  );
}

// ---------------------------------------------------------------------------
// Public merchant self-signup (Phase G) — no JWT required.
// ---------------------------------------------------------------------------

export interface SignupMerchantInput {
  merchant: {
    legalName: string;
    tradeName?: string;
    tin: string;
    email?: string;
    phone?: string;
    vatNumber?: string;
    city?: string;
    region?: string;
    zone?: string;
    wereda?: string;
    kebele?: string;
    houseNumber?: string;
  };
  branch?: { name?: string; latitude?: number; longitude?: number };
  owner: { email: string; password: string; name?: string };
  turnstileToken?: string;
  legalDocument: File;
}

export function signupMerchant(
  input: SignupMerchantInput,
): Promise<PendingAuthResponse> {
  const { legalDocument, turnstileToken, ...payload } = input;
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  form.set("legalDocument", legalDocument);
  return api<PendingAuthResponse>("/signup/merchant", {
    method: "POST",
    headers: turnstileToken ? { "X-Turnstile-Token": turnstileToken } : {},
    body: form,
  });
}

export function signupMerchantWithGoogle(
  input: Omit<SignupMerchantInput, "owner" | "turnstileToken"> & {
    googleToken: string;
  },
): Promise<LoginResponse> {
  const { legalDocument, googleToken, ...details } = input;
  const form = new FormData();
  form.set("payload", JSON.stringify({ ...details, googleToken }));
  form.set("legalDocument", legalDocument);
  return api<LoginResponse>("/signup/google/merchant", {
    method: "POST",
    body: form,
  });
}

export function resendEmailVerification(
  pendingToken: string,
): Promise<{ ok: true }> {
  return api("/auth/email-verification/resend", {
    method: "POST",
    body: JSON.stringify({ pendingToken }),
  });
}

export function verifyEmail(
  pendingToken: string,
  otp: string,
): Promise<LoginResponse> {
  return api("/auth/email-verification/verify", {
    method: "POST",
    body: JSON.stringify({ pendingToken, otp }),
  });
}

export function getTwoFactorOptions(
  pendingToken: string,
): Promise<{ email: string; phone: string | null; phoneAvailable: boolean }> {
  return api("/auth/2fa/options", {
    method: "POST",
    body: JSON.stringify({ pendingToken }),
  });
}

export function sendTwoFactor(
  pendingToken: string,
  method: "email" | "phone",
): Promise<{ ok: true }> {
  return api("/auth/2fa/send", {
    method: "POST",
    body: JSON.stringify({ pendingToken, method }),
  });
}

export function verifyTwoFactor(
  pendingToken: string,
  method: "email" | "phone",
  otp: string,
): Promise<LoginResponse> {
  return api("/auth/2fa/verify", {
    method: "POST",
    body: JSON.stringify({ pendingToken, method, otp }),
  });
}

/** Public SLA status — no auth. Reads the body even on 503 (overall down is a
 *  valid report to render, not a fetch failure). */
export async function getSystemStatus(): Promise<StatusReport> {
  const res = await fetch(`${API_BASE}/status`, {
    headers: { "Content-Type": "application/json" },
  });
  return (await res.json()) as StatusReport;
}

// ---------------------------------------------------------------------------
// Merchant exports
// ---------------------------------------------------------------------------

export function listMerchantExports(
  merchantId: string,
): Promise<MerchantExport[]> {
  return api<MerchantExport[]>(`/merchants/${merchantId}/exports`);
}

export function createMerchantExport(
  merchantId: string,
): Promise<MerchantExport> {
  return api<MerchantExport>(`/merchants/${merchantId}/exports`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/**
 * Fetches the finished export bundle with the auth header attached, then
 * triggers a browser download from the resulting Blob. Bypasses the 401 that
 * a bare `<a href>` link hits — top-level navigation to the API URL doesn't
 * forward the Bearer token from localStorage.
 */
export async function downloadMerchantExport(
  merchantId: string,
  exportId: string,
): Promise<void> {
  const { blob, filename } = await apiBlob(
    `/merchants/${merchantId}/exports/${exportId}/download`,
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `merchant-${merchantId}-export-${exportId}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Scheduled reports

export type ReportScheduleKind = "INTERVAL_HOURS" | "DAILY_AT";
export type ReportBranchScope = "SINGLE_BRANCH" | "MERCHANT_WIDE";
export type ReportSection = "SALES" | "INVENTORY";
export type ReportRunStatus =
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "SKIPPED_EMPTY"
  | "FAILED";

export interface ScheduledReport {
  id: string;
  merchantId: string;
  name: string;
  active: boolean;
  scheduleKind: ReportScheduleKind;
  intervalHours: number | null;
  dailyAtMinute: number | null;
  timezone: string;
  branchScope: ReportBranchScope;
  branchId: string | null;
  sections: ReportSection[];
  recipients: string[];
  language: string;
  deliveredThrough: string;
  nextRunAt: string;
  lastRunAt: string | null;
  consecutiveFailures: number;
  createdByEmail: string | null;
  createdAt: string;
}

export interface ScheduledReportRun {
  id: string;
  status: ReportRunStatus;
  windowStart: string;
  windowEnd: string;
  scheduledFor: string;
  completedAt: string | null;
  invoiceCount: number;
  cancellationCount: number;
  receiptCount: number;
  movementCount: number;
  recipientCount: number;
  errorMessage: string | null;
}

export interface ScheduledReportInput {
  name: string;
  scheduleKind: ReportScheduleKind;
  intervalHours?: number;
  dailyAtMinute?: number;
  timezone?: string;
  branchScope?: ReportBranchScope;
  branchId?: string;
  sections: ReportSection[];
  recipients: string[];
  language?: string;
  active?: boolean;
}

export interface ReportLimits {
  maxRecipients: number;
  maxPerMerchant: number;
}

export interface ReportPreview {
  window: { start: string; end: string };
  empty: boolean;
  counts: {
    invoices: number;
    cancellations: number;
    receipts: number;
    movements: number;
  };
  sales?: {
    generated: { count: number; preTax: number; tax: number; total: number };
    cancelled: { count: number; total: number };
    receipts: { count: number; collected: number };
    withholding: { count: number; withheld: number };
    byBranch: Array<{
      branchId: string;
      branchName: string;
      count: number;
      total: number;
    }>;
  };
  inventory?: {
    totalMovements: number;
    stores: Array<{
      storeId: string;
      storeName: string;
      branchName: string | null;
      net: number;
      in: number;
      out: number;
      count: number;
    }>;
  };
}

export async function reportLimits(): Promise<ReportLimits> {
  return api<ReportLimits>("/reports/limits");
}

export async function listScheduledReports(
  merchantId: string,
): Promise<ScheduledReport[]> {
  return api<ScheduledReport[]>(`/merchants/${merchantId}/scheduled-reports`);
}

export async function createScheduledReport(
  merchantId: string,
  input: ScheduledReportInput,
): Promise<ScheduledReport> {
  return api<ScheduledReport>(`/merchants/${merchantId}/scheduled-reports`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateScheduledReport(
  merchantId: string,
  reportId: string,
  input: Partial<ScheduledReportInput>,
): Promise<ScheduledReport> {
  return api<ScheduledReport>(
    `/merchants/${merchantId}/scheduled-reports/${reportId}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function deleteScheduledReport(
  merchantId: string,
  reportId: string,
): Promise<void> {
  await api<void>(`/merchants/${merchantId}/scheduled-reports/${reportId}`, {
    method: "DELETE",
  });
}

export async function runScheduledReportNow(
  merchantId: string,
  reportId: string,
): Promise<{ queued: boolean }> {
  return api<{ queued: boolean }>(
    `/merchants/${merchantId}/scheduled-reports/${reportId}/run-now`,
    { method: "POST" },
  );
}

export async function listScheduledReportRuns(
  merchantId: string,
  reportId: string,
): Promise<ScheduledReportRun[]> {
  return api<ScheduledReportRun[]>(
    `/merchants/${merchantId}/scheduled-reports/${reportId}/runs`,
  );
}

export async function previewReport(
  merchantId: string,
  input: {
    from: string;
    to: string;
    sections: ReportSection[];
    branchScope?: ReportBranchScope;
    branchId?: string;
  },
): Promise<ReportPreview> {
  return api<ReportPreview>(
    `/merchants/${merchantId}/scheduled-reports/preview`,
    { method: "POST", body: JSON.stringify(input) },
  );
}
