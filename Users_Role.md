# Zemen-ePOS users, roles and responsibilities

## Purpose of this document

This document explains every user role currently implemented in Zemen-ePOS, what each user does, which parts of the application they use, what data they can access, and what they must not do.

The descriptions come from the real backend and frontend permission maps. The backend remains authoritative: hiding a button in the frontend is only a usability measure; the API independently verifies permissions, merchant ownership, branch grants and consent on every request.

## Implemented roles

The system currently contains these roles:

1. `SUPER_ADMIN` — platform operator.
2. `MERCHANT_ADMIN` — merchant owner or tenant administrator.
3. `BRANCH_ADMIN` — administrator of one assigned branch.
4. `ACCOUNTANT` — financial and tax operations user.
5. `STORE_KEEPER` — inventory and procurement operations user.
6. `CASHIER` — point-of-sale user.
7. `SUPPORT` — read-only operational troubleshooting user.
8. `ADMIN` — legacy compatibility role; not available for new assignment.

## Scope concepts every administrator must understand

### Platform scope

Platform scope covers the Zemen-ePOS service itself and all merchants at an administrative level. A Super Admin normally works in this scope.

Platform scope includes:

- merchant registration review;
- merchant activation, suspension and rejection;
- additional-branch approval;
- platform health;
- email deliverability;
- translation administration;
- platform audit and support access requests.

Platform scope does not automatically mean permission to conduct a merchant's business or create fiscal transactions for them.

### Merchant scope

A merchant is a tenant. Its users, branches, buyers, catalogue, stores, vendors, purchases, invoices, receipts and audit records are isolated from every other merchant.

A normal merchant user cannot change their merchant ID or read another tenant's records.

### Branch scope

A branch is an operational establishment belonging to a merchant. Branch scope determines which stock, stores, invoices, receipts and activities a user can work with.

Users other than Merchant Admin receive explicit branch grants. They may also have a pinned default branch selected automatically after login.

### Merchant Admin branch access

A Merchant Admin has implicit access to every active branch in their merchant. Individual branch grants are ignored for this role.

### Other users' branch access

Accountants, Store Keepers, Cashiers and Support users must receive at least one branch grant. A Branch Admin must receive exactly one branch. The backend validates that every granted branch belongs to the same merchant.

## Summary matrix

| Capability | Super Admin | Merchant Admin | Branch Admin | Accountant | Store Keeper | Cashier | Support |
|---|---:|---:|---:|---:|---:|---:|---:|
| Platform dashboard | Yes | No | No | No | No | No | No |
| Merchant dashboard | With consent | Yes | Yes | Yes | No | Yes | No |
| Approve merchants/branches | Yes | No | No | No | No | No | No |
| Edit own merchant | No tenant write without context | Yes | No | No | No | No | No |
| Manage branch credentials/certificates | Platform administration | Yes | No | No | No | No | No |
| Manage users | Platform/consent rules | Yes | No | No | No | No | No |
| Create invoices/sales | No | Yes | Yes | Yes | No | Yes | No |
| View invoices | Yes/read context | Yes | Yes | Yes | No | Yes | Yes |
| Create normal receipts | No | Yes | Yes | No | No | Yes | No |
| Create withholding | No | Yes | No | Yes | No | No | No |
| Manage inventory catalogue | With edit consent | Yes | Yes | No | Yes | No | No |
| View inventory | Yes/read context | Yes | Yes | Yes | Yes | Yes | Yes |
| Manage stores | With edit consent | Yes | Create/update | View | Full | View | No |
| Manage vendors | With edit consent | Yes | Create/update | View | Full | No | No |
| Record purchases | With edit consent | Yes | Yes | View | Yes | No | No |
| Write off stock | With edit consent | Yes | Yes | No | Yes | No | No |
| Scheduled reports | View platform/context | Yes | Yes | Yes | No | No | No |
| Merchant audit | Platform/tenant rules | Yes | No | Yes | No | No | No |
| Merchant data export | Yes | Yes | No | No | No | No | No |

The matrix summarizes the implemented permission bundles. Tenant and branch checks can further restrict a technically permitted operation.

## 1. Super Admin

### Who this user is

The Super Admin works for the organization operating Zemen-ePOS. This is not a merchant owner, cashier or branch worker. The role is responsible for platform governance, onboarding, technical monitoring and controlled support.

### Main objective

The Super Admin answers:

> Is the platform healthy, are merchant applications legitimate, and are approved merchants configured safely?

### Main screens

- System Dashboard.
- Merchants.
- Branch Approvals.
- Users where platform policy permits.
- Audit.
- Email Deliverability.
- Translation Management.
- Status and health information.
- Read-only operational lists exposed for platform administration.

### Merchant registration duties

The Super Admin can create a merchant directly from the Merchants page. A back-office-created merchant is immediately approved and active.

For self-registered merchants, the Super Admin must review:

- legal name;
- trade name;
- unique TIN;
- VAT number where supplied;
- merchant email and phone;
- registered address;
- applicant/owner identity and email;
- signup time and last-login information;
- first branch details;
- prior rejection state or reason;
- apparent duplicate or conflicting information.

The current system does not upload government registration documents or automatically verify a TIN against a government registry. The Super Admin must obtain and validate external evidence through the organization's compliance process before approval.

### Approval workflow

```text
Merchant submits application
→ Super Admin opens Merchants
→ reviews merchant, owner and branch information
→ approves or rejects
```

Approval:

- activates the merchant;
- stamps approval time and approving user;
- approves the initial signup branch;
- starts branch certificate provisioning;
- queues an approval notification.

Rejection:

- records rejection time and rejecting user;
- stores an optional reason;
- leaves operational transactions blocked;
- queues a rejection email.

### Additional branch approval

Branches created later by a Merchant Admin remain pending. The Super Admin reviews them under Branch Approvals or the merchant's branch table.

Approval activates the branch and starts certificate provisioning. Rejection records the actor, time and reason.

### Platform monitoring duties

The Super Admin monitors:

- database, Redis, Vault, EIRMS and worker health;
- platform merchant counts and operational summaries;
- failed or delayed email delivery;
- audit events;
- translation availability;
- abnormal login, approval or configuration activity.

### Consent-based merchant access

Super Admin support access is controlled by consent. The Super Admin requests access from a merchant, and the Merchant Admin accepts or rejects it.

Possible consent scopes include:

- `DASHBOARD` — merchant dashboard view;
- `INVOICES` — invoice viewing;
- `RECEIPTS` — receipt viewing;
- `INVENTORY` — read-only inventory/store/vendor/purchase access;
- `INVENTORY_EDIT` — inventory, store, vendor, purchase and write-off changes;
- `USERS_EDIT` — merchant-user administration.

Consent is merchant-specific and time-limited. It does not grant permission to register invoices or receipts on behalf of a merchant.

### What the Super Admin must not do

- Share the Super Admin account.
- Use platform access for ordinary cashier work.
- Create merchant invoices or receipts.
- inspect merchant operational data without a valid business purpose and required consent;
- copy EIRMS secrets or private signing keys;
- approve an application without completing external verification;
- disable or alter a merchant without recording the operational reason.

## 2. Merchant Admin

### Who this user is

The Merchant Admin is the merchant owner, business administrator or trusted tenant-level operator. A self-registering owner becomes the first Merchant Admin.

### Main objective

The Merchant Admin answers:

> Is my whole business configured correctly, are all branches ready, and do the right employees have the right access?

### Scope

The Merchant Admin can work only inside their own merchant, but has implicit access to every active branch in that merchant.

### Main responsibilities

- Maintain merchant profile and contact details.
- Create additional branches.
- Maintain branch identity, address and location.
- Enter and rotate branch EIRMS credentials.
- Complete INSA certificate onboarding.
- Create, update, activate and assign merchant users.
- Manage inventory catalogue and stock.
- Manage stores, vendors, purchases and write-offs.
- Run POS and financial operations when needed.
- Review invoices, receipts and withholding.
- Run and schedule reports.
- Review the merchant audit trail.
- Approve, reject or revoke Super Admin consent requests.
- Request and download merchant data exports.

### Branch readiness responsibilities

For every branch, the Merchant Admin ensures:

- the branch is approved and active;
- the branch has a valid system number when issued;
- tax identity and address are correct;
- EIRMS client ID, client secret and API key are configured;
- the INSA request form and CSR are submitted;
- the returned certificate is uploaded and valid;
- an active default/sales-floor store exists;
- staff have correct branch grants;
- inventory is available in the correct stores.

### INSA certificate workflow

```text
Open Merchants
→ select approved branch
→ open Certificate
→ enter contact details
→ download CSR and DOCX request
→ email both files to INSA
→ mark request as sent
→ receive issued PEM
→ upload and verify PEM
```

Private keys and EIRMS credentials are stored in Vault. The UI shows readiness flags but does not read secrets back.

### User-management workflow

```text
Open Users
→ Add user
→ enter email, name and temporary password
→ choose role
→ grant permitted branches
→ choose default branch
→ save and communicate credentials securely
```

Merchant Admin can create another Merchant Admin. Because Merchant Admin has access to all branches and security settings, this role should be assigned only to owners or highly trusted management.

### Operational permissions

Merchant Admin can perform every major merchant operation:

- create/update/delete inventory catalogue entries;
- manage buyers;
- create and update invoices;
- create receipts and withholding records;
- manage stores and transfers;
- manage vendors and purchases;
- write off stock;
- manage reports.

This allows a small business owner to operate without creating separate employee accounts, although separate accounts are recommended for accountability.

### What the Merchant Admin cannot do

- Access another merchant.
- Approve their own merchant application.
- Approve their own later branch.
- Manage platform health or translations.
- View another tenant's audit or transactions.
- Assign `SUPER_ADMIN` or legacy `ADMIN` roles.

## 3. Branch Admin

### Who this user is

The Branch Admin is the operational manager of one branch. The user form requires exactly one branch grant for this role.

### Main objective

The Branch Admin answers:

> Is my assigned branch operating correctly today?

### Daily responsibilities

- Review the branch dashboard.
- Manage the branch product catalogue and stock operations.
- Manage buyers used by the branch.
- Create and review sales invoices.
- Create and review normal receipts.
- View withholding information.
- View branch identity/readiness information.
- Create and update branch stores where permitted.
- Create and update vendors.
- Record purchases.
- Record write-offs.
- Run scheduled reports for operational needs.

### Inventory responsibilities

The Branch Admin can:

- create or update inventory items;
- receive stock through purchases;
- adjust/count stock;
- transfer stock between stores in the assigned branch;
- write off damaged, expired, lost or unusable stock;
- maintain operational stores and vendors.

### Sales responsibilities

The Branch Admin can cover cashier operations where necessary:

```text
Select buyer/items
→ reserve stock
→ submit invoice to EIRMS
→ print/share invoice
→ record payment receipt
```

### What the Branch Admin cannot do

- Access a second branch.
- Edit the merchant profile.
- Create or approve branches.
- Change EIRMS credentials or certificate onboarding.
- Manage users or consent.
- View platform administration.
- Delete stores or vendors under the current permission bundle.
- Create withholding records, although withholding data can be viewed.

## 4. Accountant

### Who this user is

The Accountant performs bookkeeping, fiscal-document, tax and financial-review work for granted branches.

### Main objective

The Accountant answers:

> What was invoiced, what was collected, what remains outstanding, and what tax documents require action?

### Main screens

- Accountant Dashboard.
- Invoices.
- Receipts.
- Withholding.
- Inventory read views.
- Stores, Vendors and Purchases read views.
- Scheduled Reports.
- Audit.

### Responsibilities

- Review revenue, collections and outstanding balances.
- Create fiscal invoices when accounting workflows require it.
- Search, verify, print and review invoice chains.
- Review receipts and payment history.
- Create withholding receipts and review the withholding register.
- Manage buyer records.
- Inspect inventory, store, vendor and purchase data for reconciliation.
- Create, edit and run scheduled financial reports.
- Review merchant-scoped audit entries relevant to financial activity.

### Procurement visibility

The Accountant can view vendors and purchases to reconcile supplier invoices and inventory costs. The role does not create vendors, purchases or stock write-offs under the current permission map.

### Receipt limitation

The current permission map gives Accountant `receipt.view` but not ordinary `receipt.create`. Withholding creation is separately allowed. Normal customer-payment receipt entry therefore belongs to Cashier, Branch Admin or Merchant Admin.

### What the Accountant cannot do

- Manage merchants, branches, EIRMS credentials or certificates.
- Manage users or consent.
- Create/update/delete inventory catalogue records.
- Create stores, vendors or purchases.
- Write off stock.
- Access ungranted branches or other merchants.

## 5. Store Keeper

### Who this user is

The Store Keeper is responsible for physical inventory, receiving, storage, transfers and stock accuracy in granted branches.

### Main objective

The Store Keeper answers:

> What stock do we have, where is it, where did it come from, and why did its quantity change?

### Main screens

- Inventory.
- Stores.
- Stock Movements.
- Vendors.
- Purchases.
- Harmonization/catalogue tools visible through inventory permissions.

### Catalogue responsibilities

- Create inventory items and categories.
- Update descriptions, codes, barcodes, units, tax and stock settings.
- Supersede old catalogue items while preserving transaction history.
- Maintain inventory images and scanning data.

### Stock responsibilities

- Count stock.
- Adjust stock with a reason.
- Review store-level balances.
- Transfer stock between stores.
- Review the stock movement ledger.
- Write off damaged, expired, stolen or unusable stock.

### Procurement responsibilities

```text
Create/select vendor
→ create purchase
→ select branch and receiving store
→ select existing inventory items
→ enter quantities and costs
→ record goods received
```

Recording the purchase increases stock in the selected store and writes RESTOCK movements. If goods arrive in a warehouse or cold room, the Store Keeper transfers sellable quantities to the sales-floor store.

### Store responsibilities

Store Keeper can create, update and delete stores, including assigning the sales-floor store. Only one store in a branch should be marked as sales floor because POS sales subtract stock from that location.

### What the Store Keeper cannot do

- Create sales invoices or receipts.
- Manage buyers.
- View financial dashboards, withholding or merchant audit.
- Manage merchant/branch identity, EIRMS credentials or certificates.
- Manage users or consent.
- Work outside granted branches.

## 6. Cashier

### Who this user is

The Cashier is the point-of-sale employee who sells products and records customer payments in granted branches.

### Main objective

The Cashier answers:

> Can I complete this customer sale quickly, correctly and with enough stock?

### Main screens

- Cashier Dashboard.
- New Sale.
- Invoices.
- Receipts.
- Read-only inventory/store information required by the POS.

### Start-of-shift workflow

1. Sign in using the individual cashier account.
2. Confirm the selected branch.
3. Confirm the POS shows the expected invoice sequence and stock.
4. Report missing items, wrong prices or unavailable stores to the Branch Admin, Store Keeper or Merchant Admin.

### Sale workflow

```text
Open New Sale
→ scan/search item
→ enter quantity
→ select or create buyer when needed
→ confirm tax and payment details
→ submit invoice
→ EIRMS accepts the document
→ stock decreases from the branch sales-floor store
→ print/share invoice or receipt
```

While a cart is open, the POS reserves stock. This prevents two cashiers from selling the same remaining units. A completed accepted sale consumes the reservation and writes SALE stock movements.

### Buyer responsibilities

The Cashier can view buyers and create a buyer required for a sale. The role cannot update or delete the broader buyer catalogue.

### Invoice and receipt responsibilities

- Create invoices.
- View/search invoices.
- Verify and print documents.
- Create normal payment receipts.
- View receipt history.
- Perform allowed invoice update/cancellation workflows exposed by the UI and backend business rules.

### What the Cashier cannot do

- Change inventory items, prices, stock quantities or stores.
- Record purchases or vendors.
- Perform write-offs or transfers.
- Create withholding receipts.
- Manage merchant, branch, credentials, certificate or users.
- View audit, reports or platform administration.
- Work in a branch that has not been granted.

## 7. Support

### Who this user is

Support is a read-only troubleshooting role within granted merchant/branch context. It is suitable for a help-desk worker who must investigate a reported problem without changing business records.

### Main objective

The Support user answers:

> What happened to this item, buyer, invoice, receipt or withholding record?

### Allowed work

- View inventory information.
- View buyer information.
- Search and inspect invoices.
- Search and inspect receipts.
- View withholding information.
- Help identify document status, reference numbers and visible errors.

### Typical workflow

```text
Merchant reports a document problem
→ Support confirms merchant/branch context
→ searches invoice or receipt
→ reviews status and visible history
→ explains result or escalates to authorized administrator
```

### What Support cannot do

- Create, update or cancel transactions.
- Create buyers.
- Change inventory or stock.
- Manage stores, vendors or purchases.
- Manage users, branches or merchant identity.
- Access audit administration or platform configuration.
- Work outside granted scope.

## 8. Legacy Admin

`ADMIN` remains in the database enum so older rows continue to load. Its permissions resemble the current Branch Admin bundle, but it is not offered in the user-creation form.

No new user should receive `ADMIN`. Existing legacy users should be reviewed and migrated to `BRANCH_ADMIN` or another current role that matches their work.

## How users are created and assigned

### Merchant self-registration

The self-registering owner becomes a merchant-wide `MERCHANT_ADMIN` automatically.

### Merchant staff creation

The Merchant Admin opens Users and enters:

- email;
- display name;
- password;
- role;
- branch grants;
- default/pinned branch.

Rules:

- Merchant Admin has implicit access to all branches.
- Branch Admin must have exactly one branch.
- Every other merchant role must have at least one granted branch.
- A pinned default must be an active granted branch.
- Users cannot be granted a branch belonging to another merchant.
- `SUPER_ADMIN` and legacy `ADMIN` are not assignable from this form.

### Updating access

Changing role, password, active status or branch grants is security-sensitive. The backend validates the acting administrator and revokes sessions when necessary so old access does not remain usable through a previously issued session.

## Account security and lifecycle

### Individual accounts

Every employee should use an individual account. Shared cashier or administrator accounts weaken the audit trail because actions can no longer be attributed to one person.

### Passwords

Passwords must meet server length limits and are stored only as hashes. Temporary passwords should be delivered through a secure channel and changed according to organizational policy.

### Login lockout

Repeated failed logins increment the failure counter and can temporarily lock an account. An authorized user administrator can unlock the account. Successful login clears the failure state.

### Deactivation

When an employee leaves or changes duties, the Merchant Admin should deactivate the account or change its role/grants immediately. Records created by that employee remain preserved for auditing.

### Branch reassignment

When moving an employee between branches:

1. remove the old branch grant;
2. add the new active branch grant;
3. update the pinned default branch;
4. confirm the role is still appropriate;
5. save and require a fresh session where applicable.

## Recommended staffing models

### Very small merchant

```text
Owner: Merchant Admin
Employee: Cashier
```

The owner manages catalogue, stock, purchasing, reporting and configuration. The cashier sells and records payments.

### Single medium branch

```text
Owner/General Manager: Merchant Admin
Branch Manager: Branch Admin
Bookkeeper: Accountant
Stock employee: Store Keeper
Till employees: Cashiers
```

### Multi-branch merchant

```text
Head office owner/IT: Merchant Admin
Each branch: one Branch Admin
Central finance: Accountants with required branch grants
Each branch/warehouse: Store Keepers
Each till: individual Cashiers
Troubleshooting desk: Support users with minimum required grants
```

## Separation-of-duties recommendations

The permission system allows a Merchant Admin or Branch Admin to perform several operational jobs, but a larger business should separate them:

- Cashier creates sales; Accountant reconciles them.
- Store Keeper receives/counts stock; Branch Admin reviews exceptions.
- Merchant Admin creates users; another manager periodically reviews access.
- Super Admin reviews merchant applications; compliance staff verify external documents.
- Write-offs should be supported by a reason and independent review.
- Vendor and purchase changes should be compared with delivery notes and supplier invoices.

These controls reduce fraud and mistakes even where the software technically allows one trusted administrator to do everything.

## Role-selection guide

Choose `MERCHANT_ADMIN` when the person must manage the entire merchant, branches, credentials or users.

Choose `BRANCH_ADMIN` when the person manages all daily work at exactly one branch but must not administer the tenant.

Choose `ACCOUNTANT` when the person needs invoices, withholding, reconciliation, audit and reports without configuration or stock-changing authority.

Choose `STORE_KEEPER` when the person manages catalogue, stores, vendors, purchasing and physical stock but must not transact at the POS.

Choose `CASHIER` when the person sells and records customer payments.

Choose `SUPPORT` when the person only investigates operational records without changing them.

Never assign `SUPER_ADMIN` to merchant personnel. Never assign legacy `ADMIN` to a new user.

## Quick responsibility summary

- **Super Admin:** runs and governs the platform, approves merchants/branches and performs consent-controlled support.
- **Merchant Admin:** owns the merchant configuration, branches, credentials, certificates, staff and all tenant operations.
- **Branch Admin:** runs one assigned branch's sales, stock and procurement operations.
- **Accountant:** handles fiscal documents, withholding, reconciliation, audit and reports.
- **Store Keeper:** controls products, stores, receiving, transfers, counts and write-offs.
- **Cashier:** sells to customers and records ordinary payments.
- **Support:** investigates records without changing them.
- **Legacy Admin:** compatibility only; migrate to a current role.
