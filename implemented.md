# Zemen-ePOS implementation and workflow audit

Audit date: 2026-08-16

This document describes what the repository actually implements. It is based on the React routes and resource calls in `apps/web`, the NestJS controllers/services in `apps/api`, the Prisma schema, and the permission maps. It does not claim features that only appear in plans or old documents.

## Executive result

The React application is connected to real backend endpoints through `apps/web/src/lib/api.ts` and `resources.ts`; it is not a static mock. The primary business modules have frontend surfaces: authentication, self-registration, dashboards, merchant and branch administration, branch approval, INSA certificate onboarding, users, consent, POS sales, invoices, receipts, withholding, inventory, stores, transfers/movements, vendors, purchases, harmonization, reports, audit, exports, email delivery monitoring, translations, status and public document links.

One confirmed integration gap found by this audit was fixed: `POST /admin/i18n/languages` already existed and had a client wrapper but no UI. The Translation Management page now includes an Add Language form.

There is **no subscription, package, plan, price, billing, checkout, payment-provider, renewal, trial, entitlement, or subscription-status model/API/UI in this repository**. Therefore system owners currently do not buy or receive subscriptions in the product and Super Admin cannot assign one. This must be designed and implemented separately before subscription can be called real.

## Where to do each important task

| Task | User interface | Backend |
|---|---|---|
| Merchant self-registration | Public `/signup` | `POST /signup/merchant` |
| Super Admin creates merchant | `/merchants` → New merchant | `POST /merchants` |
| Review/approve/reject merchant | `/merchants` → select pending merchant | `GET/PATCH/POST /merchants/:id...` |
| Merchant creates another branch | `/merchants` → Add branch, or onboarding wizard | `POST /merchants/:id/branches` |
| Review later branches | `/branch-approvals` | `GET /platform/branch-approvals`, approve/reject routes |
| Enter branch EIRMS client ID/secret/API key | `/merchants` → branch → Edit | branch `PATCH`; secrets are moved to Vault |
| Generate/download INSA CSR and form | `/merchants` → approved branch → Certificate | certificate GET/PATCH/download routes |
| Email INSA | Certificate wizard, step “Email both files to INSA” | UI creates a mail draft; user sends it manually |
| Upload INSA certificate | Same Certificate wizard, final step | `POST .../certificate/pem` |
| Manage merchant staff | `/users` | `/users` CRUD/unlock routes |
| Export merchant data | `/account` | `/merchants/:id/exports` |
| Subscription | **Not implemented** | **No model or endpoint** |

## Merchant registration workflows

### A. Merchant registers themselves

1. The owner opens `/signup`; no login is required.
2. They enter legal/trade name, TIN and contact/address details, first-branch name/location, and owner name/email/password. Turnstile is required when enabled on the server.
3. `POST /signup/merchant` transactionally creates:
   - an inactive merchant with `approvedAt = null`;
   - an inactive initial branch with `approvedAt = null`;
   - a default `Main` sales-floor store;
   - a merchant-wide `MERCHANT_ADMIN` owner account;
   - branch access/session state.
4. Duplicate TIN/email is rejected. Password is hashed. The new owner is signed in, but pending status blocks invoice/receipt creation.
5. Super Admin opens `/merchants`. Pending applications are sorted first. The detail view shows the merchant identity and address, TIN, applicant/owner email and name, account activity, admin count, and first branch.
6. Approve is implemented as the first Super Admin update setting `active=true`. The backend stamps `approvedAt` and `approvedBy`, approves/activates the initial branch, provisions certificate onboarding material asynchronously, and queues the approval notification.
7. Reject records `rejectedAt`, `rejectedBy`, and an optional reason and queues a rejection email. A rejected owner can still sign in to see the state/reason, but operational writes remain blocked. A previously rejected application can later be approved.
8. After approval, the merchant admin completes branch tax identity, EIRMS credentials and the INSA certificate flow. The branch cannot make signed EIRMS transactions until readiness requirements are present.

### B. Super Admin registers a merchant

1. Super Admin opens `/merchants` and selects New merchant.
2. The form calls `POST /merchants` with merchant identity/contact/address fields.
3. Back-office-created merchants are active and approved immediately; `approvedBy` records the actor. They do not enter the self-signup queue.
4. Super Admin adds a branch. A branch created by Super Admin is approved immediately and receives its default store. Branch credentials entered in the form are persisted to Vault, not exposed in API responses.
5. Super Admin or the merchant administrator creates users from `/users`. There is no automatic owner user created by the back-office merchant-create route, so at least one `MERCHANT_ADMIN` must be provisioned before a merchant can administer itself.

## What Super Admin can and should review before approval

The implemented review screen provides data for a human decision; the code does **not** integrate with a government registry and does **not** provide document uploads for a trade licence, TIN certificate, VAT certificate, owner ID, articles of incorporation or bank proof.

Implemented checks available on `/merchants`:

- legal name and optional trade name;
- unique TIN and optional VAT number;
- merchant email/phone;
- region, city, zone, wereda, kebele and house number;
- signup owner name/email, whether their account is active, signup time and last login;
- number of merchant administrators;
- initial branch name, location/identity fields and status;
- rejection history/reason and active/approved state.

Operational approval checklist recommended with current data:

1. Compare legal name and TIN with evidence obtained outside this system.
2. Confirm contact email/phone and the applicant's authority.
3. Confirm the address and first establishment/branch are plausible.
4. Check duplicate/conflicting identity and prior rejection information.
5. Approve only after external evidence is satisfactory, or reject with a clear reason.

Missing compliance functionality: application document upload/storage, document categories, reviewer checklist/sign-off, registry verification, maker-checker/two-person approval, risk scoring, expiry tracking and approval comments beyond rejection reason. Approval currently remains a Super Admin judgment based on displayed fields and external verification.

## Branch, EIRMS credential and INSA certificate workflow

EIRMS credentials and signing certificates are **per branch**, not per merchant.

1. Open `/merchants`, select the merchant and select/edit an approved branch.
2. Enter the branch system number, sub-TIN, trade name, VAT/address/location, stock policy, EIRMS client ID, EIRMS client secret and API key. Secret values are written to Vault; the frontend receives only `...Set` flags and never reads the secret back.
3. Open the **Certificate** action on that branch. This opens `CertificateSheet` in `apps/web/src/components/certificate-sheet.tsx`.
4. Save the INSA contact-person fields and reason.
5. Download both `request.csr` and `request-form.docx`. The private key is generated/stored in Vault and is not downloaded or emailed.
6. In the wizard's **Email both files to INSA** step, attach those two downloaded files. The button opens a pre-addressed email draft and the address can be copied. The backend value defaults to **`icr@insa.gov.et`**, configurable with `EIRMS_CERTIFICATE_EMAIL`. The application does not silently send the email; the operator sends it from their mail client.
7. Click Mark as sent. This records `submittedAt`; it does not prove mail delivery.
8. When INSA replies with the issued `.pem`, return to the same Certificate wizard and paste the PEM or choose the file, then click Upload and verify.
9. The backend verifies the public key matches the generated private key/CSR and checks certificate identity before storing the certificate in Vault. The UI then displays subject CN, serial, validity dates and completion status.
10. A bring-your-own private-key option exists for a certificate issued against a pre-existing key. It should be used only for migration; the supplied private key and PEM are verified and stored, and `usedByo` is recorded.

The Certificate button is visible for approved branches in `/merchants`. Readiness is also visible in the branch switcher and branch readiness panel. All three EIRMS credentials plus signing key/certificate are transaction gates.

## Additional branch approval

Merchant admins can create branches. Unlike the initial signup branch, later merchant-created branches stay inactive/pending. Super Admin reviews them globally at `/branch-approvals` or in the selected merchant's branch table. Approve stamps actor/time, activates the branch and starts certificate provisioning. Reject records actor/time/reason. Super Admin-created branches are approved immediately.

## Users and responsibilities

### SUPER_ADMIN

Runs the platform rather than a merchant's till. Uses the system dashboard/health, merchant approval and state management, branch approval, cross-tenant user/merchant views allowed by policy, audit, email deliverability, translations and exports. Can request time-limited consent to enter merchant business data. Consent scopes can grant dashboard, invoice, receipt, inventory, inventory-edit or user-edit access; consent never permits the Super Admin to create invoices/receipts for a merchant.

### MERCHANT_ADMIN

The tenant owner/administrator. Has merchant-wide access to every active branch. Maintains merchant/branch details and EIRMS credentials, completes certificates, creates later branches, manages staff and grants/default branches, audits their tenant, manages inventory/stores/vendors/purchases, performs sales/accounting work, schedules reports, manages consent and exports merchant data.

### BRANCH_ADMIN

Operates only explicitly granted branches. Runs the branch dashboard, sales, invoices, receipts, buyer/catalogue and stock operations, stores/vendors/purchases/write-offs and reports. Cannot change tenant identity, branch EIRMS credentials, users, consent or platform settings.

### ACCOUNTANT

Uses the accountant dashboard, invoices, receipts, withholding register/creation, buyers, read-only inventory/procurement views, audit and scheduled reports. Can register invoices and withholding but cannot administer merchants, users, branches/credentials or stores.

### STORE_KEEPER

Works in inventory, categories, stock counts/adjustments/write-offs, store stock and transfers, movement history, vendors and purchases. Is restricted to granted branch context and has no POS sale, finance, user or merchant administration duties.

### CASHIER

Uses the cashier dashboard and `/sale`, searches/views invoices and receipts, registers sales and receipts where permitted, prints documents, verifies documents, and works only in granted/selected branches. POS reservations prevent concurrent carts from overselling reserved stock. The cashier has no tenant/user/configuration or inventory-administration access.

### SUPPORT

Read-only operational troubleshooting role for invoices and receipts within its granted tenant/branch context. It cannot transact, change inventory, manage staff or alter credentials.

### ADMIN

Legacy database enum retained for old rows. It is not assignable in the current user form and should be migrated to a current role.

## Operational workflows

### Authentication and scope

Login uses access JWT plus rotating refresh cookie, rate limiting/Turnstile when configured, lockout after repeated failures, forgot/reset password and logout revocation. Every non-platform user is merchant-scoped. Branch headers select only a granted branch; merchant admin has implicit access to all active branches. Route guards and sidebar visibility mirror backend permissions.

### Sale and invoice

The POS loads the inventory catalogue, maintains cart reservations, selects/creates a buyer, calculates fiscal lines, obtains the next strict branch sequence and registers through EIRMS. The backend checks active merchant/branch, credentials, certificate, totals, stock policy and reservation ownership; signs and sends the request; then persists the accepted invoice, lines, buyer and stock movements. Draft/offline sync, verification, external IRN lookup/import, print/public links, cancellation and credit/debit memo chains are implemented.

### Receipt and withholding

Users can list/filter, inspect, print and verify receipts, find a receipt for an invoice and create payment receipts against invoices. Withholding has a dedicated register and TWTH/IWTH creation flow. Public tokenized receipt pages are available from notifications.

### Inventory and procurement

The frontend covers paged/searchable items, categories, images/barcodes, create/update/supersede, stock adjustments/counts/write-offs, per-store stock, transfers and ledger movements. Stores, vendors, purchase receiving and harmonization codes have their own screens. Sales consume stock and cancellation reverses eligible movements.

### Reports, exports and monitoring

Merchant admins/accountants can create, edit, run and inspect scheduled emailed reports. Merchant admins can request and download asynchronous merchant exports from `/account`. Audit logs have list/detail UI. Super Admin has platform dashboard/health and email-event/domain delivery UI. `/status` is public and login-free.

## Frontend-to-backend coverage conclusions

The main controllers have real UI consumers. Some read-detail endpoints are consumed indirectly through sheets/dialogs, and some list pages intentionally do not expose every HTTP method because the role lacks that permission. Public health/webhook/metrics endpoints are machine-facing and correctly have no business UI.

Remaining product gaps, not frontend-only omissions:

- subscription/billing/plan lifecycle (entire vertical absent);
- merchant compliance-document upload and approval checklist;
- automated INSA email transmission and delivery tracking (currently mailto + manual status);
- automated INSA reply ingestion (PEM upload is manual);
- government registry verification;
- formal two-person approval.

These require backend schema, services, permissions, audit rules and UI together; adding buttons alone would not make them a real system.

## Verification notes

The audit compared all NestJS controllers with exported client resource functions and React page/component usage. The only orphaned mutating client function was language creation, now connected to the UI. Machine endpoints (`/healthz`, `/livez`, `/metrics`, webhooks), individual lookup helpers, and intentionally local report previews are not considered missing pages.
