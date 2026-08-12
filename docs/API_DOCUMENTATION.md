# EIRMS / Zemen-ePos API documentation

This document covers every route in the six requested controllers: `auth`, `users`, `merchants` (including branches), `invoices`, `receipts`, and `inventory`. It was derived from the controllers, DTO validation decorators, services, guards, tenant-context helpers, and Prisma schema.

## Runtime conventions

- Default base URL: `http://localhost:4899` (`PORT` overrides it). There is **no global `/api` route prefix**.
- JSON validation uses `whitelist: true`, `forbidNonWhitelisted: true`, and transformation. Unknown body/query properties produce `400`.
- Protected calls use `Authorization: Bearer <access JWT>`. The access token lasts 5 minutes.
- Add `X-Branch-Id: <branchId>` when selecting an allowed branch. Cashiers and other branch users may only select granted branches; `MERCHANT_ADMIN` can select any active branch in its merchant.
- A `SUPER_ADMIN` entering a merchant through an accepted consent grant sends `X-Consent-Merchant-Id: <merchantId>`. Consent only grants the scopes listed below; it never grants invoice/receipt creation.
- Timestamps in Prisma responses are ISO-8601 JSON strings. Prisma models are returned directly unless a safe response type is documented.
- Standard failures: `400` validation/business rule, `401` missing/expired JWT, `403` permission/tenant violation, `404` tenant-safe absence, `409` duplicate/state conflict, `429` throttle, `502` MoR/EIRMS failure.

## Authentication and authorization

Login normalizes the email, verifies the bcrypt hash, rejects inactive users, and enforces account lockout (5 failures locks for 15 minutes). `POST /auth/login` also has an IP throttle of 5 per 5 minutes and may require Cloudflare Turnstile depending on deployment configuration. A successful login returns a 5-minute JWT and sets an `eirms_refresh` opaque token as an `HttpOnly` cookie. Only its SHA-256 hash is stored. The cookie lasts 30 days, is scoped to `/auth`, and is `Secure` in production.

`POST /auth/refresh` consumes and rotates the refresh token and returns a new access JWT. Reuse of a revoked, unexpired refresh token is treated as compromise and revokes all sessions for that user. Logout revokes the presented refresh token and clears the cookie. Password reset also revokes all sessions.

The global guard order is JWT first, permission guard second. `@Public()` bypasses JWT. Required permission codes must all be present. A non-super-admin token must contain a merchant ID. Service/query helpers then constrain rows to the request merchant and active branch.

### Role matrix for permissions used here

| Permission | SUPER_ADMIN native | MERCHANT_ADMIN | ACCOUNTANT | STORE_KEEPER | CASHIER | SUPPORT |
|---|---:|---:|---:|---:|---:|---:|
| `merchant.view` | yes | yes | no | no | no | no |
| `merchant.create` | yes | no | no | no | no | no |
| `merchant.update` | yes | yes | no | no | no | no |
| `branch.view` | yes | yes | yes | yes | no | no |
| `branch.create`, `branch.update` | yes | yes | no | no | no | no |
| `user.view`, `user.create`, `user.update` | consent only | yes | no | no | no | no |
| `invoice.view` | consent only | yes | yes | no | yes | yes |
| `invoice.create`, `invoice.update` | no | yes | yes | no | yes | no |
| `receipt.view` | consent only | yes | yes | no | yes | yes |
| `receipt.create` | no | yes | no | no | yes | no |
| `withholding.view` | no | yes | yes | no | no | yes |
| `withholding.create` | no | yes | yes | no | no | no |
| `inventory.view` | consent only | yes | yes | yes | yes | yes |
| `inventory.create`, `inventory.update` | `INVENTORY_EDIT` consent | yes | yes | yes | no | no |
| `writeoff.create` | `INVENTORY_EDIT` consent | yes | yes | yes | no | no |

SUPER_ADMIN consent mappings used here: `USERS_EDIT` grants user view/create/update; `INVOICES` grants invoice view; `RECEIPTS` grants receipt view; `INVENTORY` grants inventory view; `INVENTORY_EDIT` grants inventory create/update and write-off. Platform merchant/branch permissions still remain tenant-checked by services.

## Endpoint inventory

`JWT` means a bearer access token is required. `Public-token` means no JWT, but `?t=` is validated by the service (the QR route is publicly cacheable and resolves by ID).

### Auth

| Method and path | Request | Response | Authentication / permission | Purpose |
|---|---|---|---|---|
| `POST /auth/login` | `LoginDto` | `LoginResponse` + refresh cookie | Public; Turnstile policy; 5/5 min | Sign in |
| `POST /auth/refresh` | Cookie only | `LoginResponse` + rotated cookie | Public; valid refresh cookie; 30/min | Refresh session |
| `POST /auth/forgot-password` | `ForgotPasswordDto` | `{ok:true}` | Public; Turnstile policy; 5/hour | Send reset email without account enumeration |
| `POST /auth/reset-password` | `ResetPasswordDto` | `{ok:true}` | Public; 10/hour | Consume reset token and revoke sessions |
| `POST /auth/logout` | Cookie only | `{ok:true}` | Public; idempotent | Revoke current refresh session |
| `GET /auth/me` | none | `AuthUser` | JWT; no additional permission | Current user |
| `PATCH /auth/me/preferences` | `UpdatePreferencesDto` | `AuthUser` | JWT; no additional permission | Change UI language |
| `GET /auth/me/context` | optional `X-Branch-Id` | `MeContext` | JWT; no additional permission | User, merchant, selected branch, available branches/readiness |

### Users

| Method and path | Request | Response | Permission | Models |
|---|---|---|---|---|
| `GET /users` | none | `SafeUser[]` | `user.view` | `User`, `UserBranch` |
| `POST /users` | `CreateUserDto` | `SafeUser` | `user.create` | `User`, `UserBranch`, `Merchant`, `Branch` |
| `PATCH /users/:id` | `UpdateUserDto` | `SafeUser` | `user.update` | `User`, `UserBranch`, `Branch`, `RefreshToken` when access is revoked/password changes |
| `POST /users/:id/unlock` | none | `SafeUser` | `user.update` | `User` |

All are JWT-protected and tenant-scoped. `SafeUser` deliberately excludes `passwordHash` and includes `branchIds`, `lockedUntil`, and `failedLoginCount`.

### Merchants and branches

| Method and path | Request | Response | Permission | Models / secrets |
|---|---|---|---|---|
| `GET /merchants` | none | `MerchantWithOwner[]` | `merchant.view` | `Merchant`, `User` |
| `POST /merchants` | `CreateMerchantDto` | `Merchant` | `merchant.create` | `Merchant` |
| `GET /merchants/:id` | none | `MerchantWithOwner` | `merchant.view` | `Merchant`, `User` |
| `PATCH /merchants/:id` | `UpdateMerchantDto` | `Merchant` | `merchant.update` | `Merchant`, notifications on approval/state changes |
| `POST /merchants/:id/reject` | `RejectMerchantDto` | `Merchant` | `merchant.create` | `Merchant`, notification queue |
| `GET /merchants/:id/branches` | none | `SafeBranch[]` | `branch.view` | `Branch`, Vault flags |
| `POST /merchants/:id/branches` | `CreateBranchDto` | `SafeBranch` | `branch.create` | `Merchant`, `Branch`, `Store`, Vault credentials |
| `GET /merchants/:id/branches/:branchId/stats` | none | `BranchStats` | `branch.view` | `Branch`, `Invoice`, `Receipt`, `UserBranch` |
| `PATCH /merchants/:id/branches/:branchId` | `UpdateBranchDto` | `SafeBranch` | `branch.update` | `Branch`, `Store`, Vault credentials |

Every route is JWT-protected. `SafeBranch` never returns EIRMS credentials; it returns only `eirmsClientIdSet`, `eirmsClientSecretSet`, `eirmsApikeySet`, `hasSigningKey`, and `hasCert` flags.

### Invoices

| Method and path | Request | Response | Authentication / permission | Models |
|---|---|---|---|---|
| `POST /invoices` | `CreateInvoiceDto` | `InvoiceWithRelations` | JWT, `invoice.create`, 60/min | `Merchant`, `Branch`, `Buyer`, `Invoice`, `InvoiceItem`, `InventoryItem`, `InventoryStock`, `StockMovement`, `StockReservation` |
| `GET /invoices` | `DocumentFilterDto` query | `Page<InvoiceWithRelations>` | JWT, `invoice.view` | `Invoice` + relations |
| `GET /invoices/next-sequence` | none | `{documentNumber,invoiceCounter}` | JWT, `invoice.view` | `Invoice` |
| `POST /invoices/draft` | `CreateInvoiceDto` | `InvoiceDraft` | JWT, `invoice.create`, `DRAFTS_ENABLED`, 60/min | `InvoiceDraft`, `Invoice`, `Branch`, `Merchant` |
| `GET /invoices/drafts` | none | `InvoiceDraft[]` | JWT, `invoice.view`, `DRAFTS_ENABLED` | `InvoiceDraft` |
| `POST /invoices/drafts/:id/sync` | none | `InvoiceWithRelations` | JWT, `invoice.create`, `DRAFTS_ENABLED`, 60/min | draft plus normal invoice models |
| `DELETE /invoices/drafts/:id` | none | `{ok:true}` | JWT, `invoice.create`, `DRAFTS_ENABLED` | `InvoiceDraft` |
| `GET /invoices/:id/qr.png` | none | PNG | Public, throttle skipped | `Invoice` |
| `GET /invoices/:id/public?t=...` | query token | `InvoiceWithRelations` | Public-token | `Invoice` + relations |
| `GET /invoices/by-irn/:irn` | none | `InvoiceWithRelations` | JWT, `invoice.view` | `Invoice` + relations |
| `POST /invoices/lookup-external` | `ImportInvoiceDto` | `VerifyInvoiceResult` | JWT, `invoice.view`, 30/min | no write; MoR verify |
| `POST /invoices/import-from-irn` | `ImportInvoiceDto` | `InvoiceWithRelations` | JWT, `invoice.create`, 60/min | `Merchant`, `Branch`, `Buyer`, `Invoice`, `InvoiceItem` |
| `GET /invoices/:id` | none | `InvoiceWithRelations` | JWT, `invoice.view` | `Invoice` + relations |
| `GET /invoices/:id/chain` | none | `InvoiceWithRelations[]` | JWT, `invoice.view` | `Invoice` chain + relations |
| `POST /invoices/:id/cancel` | `CancelInvoiceDto` | `InvoiceWithRelations` | JWT, `invoice.update`, 30/min | `Invoice`, `InvoiceCancellation`, `StockMovement`, `InventoryStock` |
| `POST /invoices/:id/verify` | none | `VerifyInvoiceResult` | JWT, `invoice.view` | read local `Invoice`; MoR verify |

Static routes such as `/next-sequence` and `/by-irn/:irn` are declared before `/:id`, so Nest resolves them correctly.

### Receipts

| Method and path | Request | Response | Authentication / permission | Models |
|---|---|---|---|---|
| `POST /receipts` | `CreateReceiptDto` | `ReceiptWithRelations` | JWT, `receipt.create`, 60/min | `Invoice`, `Receipt`, `ReceiptInvoice`, `Buyer`, notifications |
| `GET /receipts` | `DocumentFilterDto` query | `Page<ReceiptWithRelations>` | JWT, `receipt.view` | `Receipt` + relations |
| `GET /receipts/withholding-register` | `DocumentFilterDto` query | page plus period totals | JWT, `withholding.view` | `Receipt` |
| `GET /receipts/next-sequence` | none | `{receiptNumber,receiptCounter}` | JWT, `receipt.view` | `Receipt` |
| `POST /receipts/withhold` | `CreateWithholdReceiptDto` | `ReceiptWithRelations` | JWT, `withholding.create`, 30/min | `Receipt`, notifications |
| `GET /receipts/withhold/next-sequence` | none | `{receiptNumber,receiptCounter,receiptCounterFormatted}` | JWT, `withholding.view` | `Receipt` |
| `GET /receipts/:id/qr.png` | none | PNG | Public, throttle skipped | `Receipt` |
| `GET /receipts/:id/public?t=...` | query token | `PublicReceiptWithRelations` | Public-token | `Receipt`, `ReceiptInvoice`, invoice/buyer/items/cancellation |
| `GET /receipts/:id` | none | `ReceiptWithRelations` | JWT, `receipt.view` | `Receipt` + relations |
| `POST /receipts/:id/verify` | none | `VerifyReceiptResult` | JWT, `receipt.view`, 30/min | read local `Receipt`; MoR verify |

### Inventory

| Method and path | Request | Response | Permission | Models |
|---|---|---|---|---|
| `GET /inventory?includeInactive=&q=` | query strings | `InventoryItemWithStock[]` | `inventory.view` | `InventoryItem`, `InventoryStock`, `Store` |
| `GET /inventory/scan/:code` | barcode | `InventoryItem` | `inventory.view` | `InventoryItem` |
| `POST /inventory` | `CreateInventoryItemDto` | `InventoryItem` | `inventory.create` | `InventoryItem`, optionally `InventoryStock`, `StockMovement`, `Store` |
| `GET /inventory/:id` | none | `InventoryItem` | `inventory.view` | `InventoryItem` |
| `PATCH /inventory/:id` | `UpdateInventoryItemDto` | `InventoryItem` | `inventory.update` | `InventoryItem` |
| `POST /inventory/:id/supersede` | `CreateInventoryItemDto` | `InventoryItem` | `inventory.update` | old/new `InventoryItem` in transaction |
| `POST /inventory/:id/stock-adjust` | `AdjustStockDto` | `InventoryItem` | `inventory.update` | `InventoryStock`, `StockMovement`, `Store` |
| `POST /inventory/:id/stock-count` | `StockCountDto` | `InventoryItem` | `inventory.update` | `InventoryStock`, `StockMovement`, `Store` |
| `GET /inventory/:id/stock` | none | `ItemStockRow[]` | `inventory.view` | `InventoryStock`, `Store`, `Branch` |
| `GET /inventory/:id/movements` | none | `StockMovement[]` | `inventory.view` | `StockMovement` |
| `POST /inventory/:id/write-off` | `WriteOffDto` | `InventoryItem` | `writeoff.create` | `InventoryStock`, `StockMovement`, `Store` |

All inventory routes are JWT-protected and merchant-scoped. Write operations require a merchant context. Barcode resolution priority is UPC, then SKU, then item code.

## DTO catalogue

Fields marked `?` are optional. Body property names are case-sensitive.

### Auth and user DTOs

- `LoginDto`: `email: email`, `password: string(8..128)`, `turnstileToken?: string`.
- `LoginResponse`: `{token: string, expiresIn: number, user: AuthUser}`.
- `AuthUser`: `{id,email,name|null,role,merchantId|null,branchId|null,language}`.
- `ForgotPasswordDto`: `email: email`, `turnstileToken?: string`.
- `ResetPasswordDto`: `token: string(min 32)`, `password: string(8..128)`.
- `UpdatePreferencesDto`: `language: "en"|"am"`.
- `CreateUserDto`: `email`, `password(8..128)`, `name?`, `role: MERCHANT_ADMIN|ACCOUNTANT|STORE_KEEPER|CASHIER|SUPPORT`, `merchantId?`, `branchIds?: string[]` (unique), `branchId?: string|null` (must be in grants unless merchant admin).
- `UpdateUserDto`: partial `name`, `role`, `active: boolean`, `password(8..128)`, `branchIds`, `branchId`.
- `SafeUser`: `{id,email,name,role,active,merchantId,branchId,branchIds,lastLoginAt,lockedUntil,failedLoginCount,createdAt,updatedAt}`.
- `MeContext`: `{user: AuthUser, merchant: Merchant|null, activeBranch: SafeBranchLite|null, availableBranches: (SafeBranchLite & {hasCreds,hasCert})[]}`.

### Merchant and branch DTOs

- `CreateMerchantDto`: required `legalName`, `tin`; optional `tradeName,email,phone,vatNumber,city,region,zone,wereda,kebele,houseNumber`.
- `UpdateMerchantDto`: all create fields optional, plus `active?: boolean`, `defaultLanguage?: "en"|"am"`.
- `RejectMerchantDto`: `reason?: string(max 500)`.
- `CreateBranchDto`: required `name`; optional `systemNumber,city,region,zone,wereda,kebele,houseNumber,subTin,tradeName,vatNumber,country,stockPolicy,eirmsClientId,eirmsClientSecret,eirmsApikey,latitude,longitude`. Latitude is -90..90; longitude -180..180; stock policy is `ALLOW_NEGATIVE|BLOCK_ON_EMPTY`.
- `UpdateBranchDto`: the same fields are optional, plus `active`; coordinates may be null.
- `MerchantWithOwner`: all `Merchant` scalar fields plus `owner: Safe admin summary|null` and `adminCount`.
- `BranchStats`: `{invoiceCount,receiptCount,userCount,lastInvoiceAt,lastReceiptAt}` (dates nullable).
- `SafeBranch`: `{id,merchantId,name,systemNumber,city,region,zone,wereda,kebele,houseNumber,subTin,tradeName,vatNumber,country,stockPolicy,latitude,longitude,eirmsClientIdSet,eirmsClientSecretSet,eirmsApikeySet,hasSigningKey,hasCert,active,createdAt,updatedAt}`.

### Invoice DTOs

- `CreateInvoiceDto`: `TransactionType: B2B|B2C|B2G`; `BuyerDetails`; `DocumentDetails`; non-empty `ItemList[]`; `PaymentDetails`; `ValueDetails`; `SourceSystem`; optional `ReferenceDetails`, `SellerOverrides`, `branchId`, `cartSessionId`.
- `BuyerDetails`: required `LegalName`; optional `Tin,City,Email,Phone,HouseNumber,IdType,IdNumber,Region,Country,Zone,Kebele,Wereda,VatNumber`.
- `DocumentDetails`: optional `DocumentNumber`; required `Date` (`DD-MM-YYYYTHH:mm:ss`) and `Type` (`INV|CRE|DEB` in business logic); `Reason?`.
- `InvoiceItem`: required `LineNumber:int, ItemCode, ProductDescription, NatureOfSupplies, Unit, Quantity:number, UnitPrice:number, PreTaxValue:number, Discount:number, ExciseTaxValue:number, TaxCode, TaxAmount:number, TotalLineAmount:number`; optional `HarmonizationCode|null,inventoryItemId,changed:boolean`.
- `PaymentDetails`: `Mode: CASH|ADVANCE|CREDIT`, `PaymentTerm: string(max 40)`.
- `ValueDetails`: `Discount?: number|null`, required `ExciseValue,TaxValue,IncomeWithholdValue,TransactionWithholdValue,TotalValue` numbers and `InvoiceCurrency`.
- `SourceSystem`: `CashierName`, `SalesPersonName`, `InvoiceCounter:int`. The service overwrites trusted system identity fields.
- `ReferenceDetails`: `PreviousIrn?`, `RelatedDocument?: string|null`.
- `SellerOverrides`: optional `LegalName,Email,Phone,City,HouseNumber,Region,SubCity,Locality,Wereda,VatNumber`; seller TIN cannot be overridden.
- `CancelInvoiceDto`: `reasonCode: string`, `remark?: string`.
- `ImportInvoiceDto`: `irn: non-empty string`.
- `DocumentFilterDto` query: `from?,to?` ISO dates; `q?`; `scope?: branch|merchant`; `status?`; `kind?: SALES|WITHHOLD`; `cursor?`; `limit?: int 1..200` (default 50).
- `Page<T>`: `{items:T[],nextCursor:string|null,total:number}`.
- `InvoiceWithRelations`: all `Invoice` scalars plus `buyer`, `items[]`, `cancellation`, and safe seller identity projections for `branch` and `merchant`.
- `InvoiceDraft`: Prisma draft scalars including provisional number, summary, `status: PENDING|SYNCING|SYNC_FAILED`, attempts/error fields, merchant/branch IDs and timestamps; the raw `payload` column exists but controller notes intend a scalar row response.
- `VerifyInvoiceResult`: the MoR `/v1/verify` response envelope; its shape is upstream-controlled and returned without local normalization.

### Receipt DTOs

- `CreateReceiptDto`: optional `reason,manualReceiptNumber,receiptCurrency(default ETB),exchangeRate|null`; required `collectedAmount:number`, non-empty `invoices[]`, and `transactionDetails`.
- `ReceiptInvoiceInput`: `invoiceId`, `paymentCoverage: FULL|PARTIAL`, `invoicePaidAmount:number`, `discountAmount?:number|null`, `remainingAmount?:number|null`, `totalAmount:number`.
- `TransactionDetails`: `paymentMode: CASH|ADVANCE|CREDIT` (classification), `modeOfPayment: CASH|CHEQUE|CPO|SWIFT|CARD|WIRE|BANK_TRANSFER|LETTER_OF_CREDIT` (instrument), `collectorName`; optional provider/cheque/CPO/document/account/transaction fields.
- `CreateWithholdReceiptDto`: `reason?`, required `invoiceDetail`, required `withholdDetail`, optional `supplier`.
- `WithholdInvoiceDetail`: `invoiceIrn`, `currency?`, `exchangeRate?:number|null >=0`.
- `WithholdDetail`: `type: TWTH|IWTH`, `rate?:number|null >=0` (default 3), `preTaxAmount>=0`, `withholdingAmount>=0`.
- `WithholdSupplier`: optional `legalName,tin,subTin,vatNumber,phone,email,city,zone,wereda,kebele`.
- `ReceiptWithRelations`: all `Receipt` scalars plus linked `ReceiptInvoice[]`; each link includes its invoice and buyer, plus safe branch and merchant identity.
- `PublicReceiptWithRelations`: above, with invoice `items[]` and `cancellation` included.
- `VerifyReceiptResult`: upstream MoR verification response, returned without local normalization.

### Inventory DTOs

- `CreateInventoryItemDto`: required `code`, `description`, `unitPrice>=0`; optional `sku,upc,longDescription,imageUrl,unit,nature(goods|service),harmonizationCode,active,trackStock,branchId`; `taxCode` must be a supported local tax code; `exciseRate,stockQuantity,lowStockThreshold` are numbers >=0.
- `UpdateInventoryItemDto`: partial `CreateInventoryItemDto`.
- `AdjustStockDto`: `delta:number`; optional `reason: RESTOCK|ADJUSTMENT`, `note`, `storeId`.
- `StockCountDto`: `counted:number>=0`, `storeId`, `note?`.
- `WriteOffDto`: `quantity:number>0`, `reason: DAMAGE|EXPIRY|THEFT|INTERNAL_USE`, non-empty `note`, `storeId?`.
- `InventoryItemWithStock`: all `InventoryItem` fields plus `totalOnHand`, `onHand|null` for active branch, and `sellable|null` for its sales-floor store.
- `ItemStockRow`: `{storeId,storeName,storeCode,branchId,branchName,isSalesFloor,quantity}`.

## Major feature flows

### Merchant onboarding, update, approval, and rejection

1. `SUPER_ADMIN` creates a row with `POST /merchants`; duplicate TIN/email constraints become `409`.
2. Branches are added separately. The service verifies the merchant, creates the branch, creates its default/sales-floor `Store`, and writes EIRMS credentials to Vault—not Prisma.
3. Users are provisioned using the merchant and branch IDs. Merchant admins are tenant-wide; other roles receive `UserBranch` grants and a pinned default branch.
4. Merchant updates are partial. Approval-relevant state transitions enqueue owner/admin notifications. Secret material never appears in responses.
5. Rejection validates that the merchant is pending, records rejection state/reason/timestamp, deactivates as appropriate, and asynchronously enqueues a rejection email. Only the platform `merchant.create` permission can reject.

### Branch management and stats

1. List/get authorization is checked, then merchant scoping prevents cross-tenant access.
2. Create validates location/identity and system-number uniqueness, creates `Branch`, provisions the default store, and moves supplied EIRMS credentials into Vault.
3. Update applies only supplied fields; credentials are merged/rotated in Vault and can be cleared according to service rules. Response exposes only readiness flags.
4. Stats verifies that `branchId` belongs to `merchantId`, then counts invoices, receipts, branch grants and reads latest activity timestamps in parallel.

### User management and lockout

1. Create normalizes email, rejects duplicates, resolves the caller's tenant, validates every branch belongs to it, hashes the password, and transactionally creates `User` plus `UserBranch` rows.
2. List is request-merchant scoped and returns safe fields only.
3. Update finds the target inside the caller's scope, prevents unsafe self/role/tenant changes, validates grants, optionally re-hashes password, replaces branch grants transactionally, and revokes sessions when security-sensitive access changes.
4. Login increments failure counters; five failures establish `lockedUntil`. Unlock clears `failedLoginCount` and `lockedUntil`, cross-tenant only for super-admin and otherwise within the merchant.

### Invoice registration, listing, drafts, import, and cancellation

1. The branch-context layer resolves merchant/branch. The service verifies merchant/branch readiness and obtains branch EIRMS credentials/token and cached seller identity.
2. Registration validates document/memo rules, totals, inventory references, branch stock policy, and reservation ownership. It stamps authoritative seller TIN/system identity and determines the strict branch sequence.
3. It signs/posts `/v1/register` to MoR. A sequence-drift response triggers one corrected retry.
4. On acceptance, one transaction upserts the tenant buyer, creates `Invoice` and `InvoiceItem` rows, consumes stock/reservations and appends sale `StockMovement` rows. Notification work is queued after persistence.
5. Listing uses branch scope by default; only merchant admin semantics permit `scope=merchant`. Cursor pagination returns total and next cursor.
6. Draft mode stores a payload plus searchable summary without calling MoR. Sync acquires a `SYNCING` mutex, recomputes sequence, uses normal registration logic, deletes the draft on success, or records attempts/error as `SYNC_FAILED`.
7. External lookup calls verify without writing. Import verifies, refuses cancelled documents, and idempotently creates source `EXTERNAL` buyer/invoice/item rows.
8. Cancellation loads a tenant-owned accepted invoice, posts its IRN/reason to MoR, creates `InvoiceCancellation`, marks the invoice cancelled, and reverses applicable sale stock movements; notification is queued.

### Receipt creation and withholding

1. Sales receipt creation loads all referenced invoices inside the tenant, enforces one branch/currency and valid unpaid balances, and validates collected/discount/remaining totals.
2. It derives the branch receipt sequence and authoritative seller/system identity, signs/posts `/v1/receipt/sales`, then transactionally creates `Receipt` and `ReceiptInvoice` rows and updates every invoice's `paidAmount`/`paymentStatus`.
3. Buyer receipt notification is queued after commit. List/get remain tenant/branch scoped.
4. Withholding uses the active branch identity, external supplier IRN, withholding type/rate/amount, posts `/v1/receipt/withholding`, and persists a `WITHHOLD` receipt with a supplier identity snapshot. It does not require a local invoice row.
5. Verify is passive: read the stored RRN, call MoR, return the upstream envelope, and do not mutate local state.

### Inventory catalogue and stock ledger

1. Create validates merchant scope and catalogue uniqueness; if stock tracking starts with quantity, it creates `InventoryStock` in the resolved sales-floor store plus a `RESTOCK` movement.
2. List computes total, active-branch, and sales-floor quantities from per-store stock. Scan performs exact UPC/SKU/code lookup.
3. Update changes the existing catalogue record. Supersede transactionally creates a successor and deactivates/links the predecessor, preserving invoice history.
4. Adjustment resolves/validates the target store, atomically changes its `InventoryStock`, and appends a signed `RESTOCK` or `ADJUSTMENT` ledger movement.
5. Stock count computes `counted - current`, sets on-hand to the physical figure, and appends an adjustment movement.
6. Write-off requires an audit note, applies a negative quantity, and records the specific damage/expiry/theft/internal-use reason. Branch `BLOCK_ON_EMPTY` and service checks prevent invalid negative stock where applicable.

## Testing strategy

Import the Postman collection and environment in `postman/`. Run login first; its test script captures `accessToken`, `userId`, and refresh cookies are retained by Postman's cookie jar. Create merchant → branch → user → inventory → invoice → receipt in that order; response scripts capture IDs for later requests.

Recommended automated layers:

1. DTO/controller tests: unknown fields, missing required fields, enum boundaries, and each public/protected route.
2. Guard matrix tests: missing/expired JWT (`401`), every role/permission (`403` vs success), tenant crossover (`404/403`), illegal branch header, and super-admin consent scopes.
3. Service tests with a disposable PostgreSQL DB: uniqueness, transaction rollback, branch scoping, cursor pagination, lockout/unlock, sequence concurrency, payment state transitions, stock movements/reversals.
4. Mocked MoR contract tests: accepted response, validation errors, timeouts/`502`, sequence drift retry, verify/import idempotency, cancellation, and signing/auth failures.
5. End-to-end happy path using a MoR sandbox: login, create invoice, verify, receipt, verify; assert DB audit rows and queued notifications. Never run financial write tests against production credentials.
6. Security/regression: refresh replay revokes the token family, password reset revokes sessions, secrets/password hashes never serialize, public tokens cannot cross documents, throttles return `429`, and stock updates remain correct under concurrent requests.

The companion [cURL examples](./CURL_EXAMPLES.md) contain executable operations and sample data.
