# Super Admin authorization matrix

Security convention: unauthenticated requests return `401`; authenticated callers without the required permission return `403`; an identifier outside the caller's authorized tenant/branch normally returns `404` to avoid confirming that it exists.

`Platform` means native Super Admin access. `Consent` means an accepted, unexpired grant supplied through `X-Consent-Merchant-Id`. Merchant and branch ownership checks are derived from authenticated request context, never client-supplied ownership fields.

| Endpoint | Method | Required role / permission | Merchant scope | Branch scope | Ownership check | Result |
|---|---:|---|---|---|---|---|
| `/dashboard/system` | GET | Platform / `dashboard.system` | Global aggregate only | None | No merchant business rows returned | Super Admin allow; others deny |
| `/dashboard/system/health` | GET | Platform / `dashboard.system` | Global aggregate only | None | N/A | Super Admin allow; others deny |
| `/merchants` | GET | `merchant.view` | Super Admin global; tenant roles own merchant | None | `MerchantsService.list` derives context | Scoped allow |
| `/merchants/:id` | GET | `merchant.view` | Own merchant or Platform | None | `assertOwnMerchant` | Scoped allow / foreign 403 |
| `/merchants` | POST | Platform / `merchant.create` | Global administration | None | Role permission plus service context | Super Admin allow; others deny |
| `/merchants/:id` | PATCH | `merchant.update` | Own merchant or Platform | None | `assertOwnMerchant`; activation Super Admin-only | Scoped allow |
| `/merchants/:id/reject` | POST | Platform / `merchant.create` | Global administration | None | Explicit Super Admin service check | Super Admin allow; others deny |
| `/platform/registrations` | GET | Platform / `merchant.create` | Global administration | None | Explicit back-office check | Super Admin allow; others deny |
| `/platform/registrations/:merchantId/document` | GET | Platform / `merchant.create` | Global administration | None | Explicit back-office check; safe storage key | Super Admin allow; others deny |
| `/platform/branch-approvals` | GET | Platform / `merchant.create` | Global administration | None | Explicit Super Admin service check | Super Admin allow; others deny |
| `/merchants/:id/branches` | GET | `branch.view` | Own merchant or Platform | All authorized branches | `assertOwnMerchant` | Scoped allow |
| `/merchants/:id/branches` | POST | `branch.create` | Own merchant or Platform | Parent merchant | `assertOwnMerchant`; server-owned relation | Scoped allow |
| `/merchants/:id/branches/:branchId` | PATCH | `branch.update` | Own merchant or Platform | Named branch | Branch queried with parent merchant match | Scoped allow / foreign 404 |
| `/merchants/:id/branches/:branchId/approve` | POST | Platform / `merchant.create` | Global administration | Named branch | Explicit Super Admin plus merchant/branch pair | Super Admin allow; others deny |
| `/merchants/:id/branches/:branchId/reject` | POST | Platform / `merchant.create` | Global administration | Named branch | Explicit Super Admin plus merchant/branch pair | Super Admin allow; others deny |
| `/users` | GET | `user.view` | Platform global; tenant roles own merchant | User grants returned only in scope | `merchantScope` and safe response DTO | Scoped allow |
| `/users` | POST | `user.create` | Platform target or authenticated own merchant | Requested branches validated under merchant | Role escalation and branch ownership checks | Scoped allow |
| `/users/:id` | PATCH | `user.update` | Target must be in context merchant | Branch grants validated | Super Admin role changes restricted to Super Admin | Scoped allow / foreign 404 |
| `/users/:id/unlock` | POST | `user.update` | Target must be in context merchant | N/A | Target scoped before mutation | Scoped allow / foreign 404 |
| `/system-configuration/tax-codes` | GET | Platform / `configuration.view` | Global configuration | None | Permission guard | Super Admin allow; others deny |
| `/system-configuration/tax-codes` | POST | Platform / `configuration.manage` | Global configuration | None | Permission guard, DTO validation, audit | Super Admin allow; others deny |
| `/system-configuration/tax-codes/:id` | PATCH | Platform / `configuration.manage` | Global configuration | None | Permission guard, existing-row check, audit | Super Admin allow; others deny |
| `/system-configuration/rules` | GET | Platform / `configuration.view` | Global configuration | None | Permission guard | Super Admin allow; others deny |
| `/system-configuration/rules/:code` | PATCH | Platform / `configuration.manage` | Global configuration | None | Permission guard, stable code lookup, audit | Super Admin allow; others deny |
| `/audit` | GET | `audit.view` | Super Admin global; tenant roles own merchant | Optional branch inside merchant filter | Context merchant filter always composed | Scoped allow |
| `/audit/:id` | GET | `audit.view` | Super Admin global; tenant roles own merchant | Row branch inherited | ID plus context merchant filter | Scoped allow / foreign 404 |
| `/email-events` | GET | Platform / `deliverability.view` | Global platform telemetry | None | Permission guard; selected response fields | Super Admin allow; others deny |
| `/email-events/by-domain` | GET | Platform / `deliverability.view` | Global platform telemetry | None | Permission guard | Super Admin allow; others deny |
| `/i18n/*` management routes | POST/PATCH/DELETE | Platform / `translation.manage` | Global master data | None | Permission guard and DTO validation | Super Admin allow; others deny |
| `/consent/requests` | POST/GET | Platform / `consent.request/manage` | Requested merchant only after acceptance | None | Grant tied to requesting Super Admin | Super Admin allow; others deny |
| `/invoices` and `/invoices/:id` | GET | `invoice.view` | Authenticated merchant; Super Admin requires `INVOICES` consent | Active/pinned branch unless authorized merchant-wide list | `tenantScope` / `listScope` | Scoped allow / foreign 404 |
| `/receipts` and `/receipts/:id` | GET | `receipt.view` | Authenticated merchant; Super Admin requires `RECEIPTS` consent | Active/pinned branch | `tenantScope` / `listScope` | Scoped allow / foreign 404 |
| `/inventory*` | GET | `inventory.view` | Authenticated merchant; Super Admin requires `INVENTORY` consent | Store/stock operations use active branch | Context merchant and branch ownership | Scoped allow / foreign 404 |
| `/stores*`, `/vendors*`, `/purchases*` | GET | Corresponding view permission | Authenticated merchant; Super Admin requires `INVENTORY` consent | Store/purchase branch validated | Context scope and resource lookup | Scoped allow / foreign 404 |
| Merchant operational writes | POST/PATCH/DELETE | Resource create/update/delete permission | Authenticated merchant; consent never grants invoice/receipt creation | Active/authorized branch | Service-level tenant, branch, and resource checks | Scoped allow / foreign deny |
| `/merchants/:id/exports*` | GET/POST | `merchant.export` | Merchant administrator own merchant only | All merchant branches in bundle | `ExportsService.assertOwnMerchant` plus export ownership | Tenant allow; native Super Admin deny |
| `/merchants/:id/scheduled-reports*` | All | `report.view/manage` | Own merchant | Branch Admin pinned to own branch | `assertOwnMerchant`, `findOwned`, branch ownership | Scoped allow / foreign 404 |
| `/merchants/:merchantId/branches/:branchId/certificate*` | GET/PATCH/POST | `branch.view/update` | Own merchant or Platform branch administration | Named branch must belong to merchant | `assertOwnMerchant` and `assertBranchExists` | Scoped allow / foreign deny |

## Central enforcement chain

1. `JwtAuthGuard`: verifies HS256 access token, then resolves current active user, role, merchant, and branch from the database.
2. `PermissionsGuard`: evaluates explicit route permissions; Super Admin merchant-data permissions require active consent scopes.
3. `BranchContextInterceptor`: validates `X-Branch-Id` against current merchant and user branch grants.
4. Request context and tenant helpers compose merchant and branch filters into database reads.
5. Services validate parent/child ownership before mutations and return not-found for foreign object identifiers where appropriate.
6. DTO whitelist rejects undeclared ownership and privilege fields.
