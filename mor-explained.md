# MoR / EIMS Integration — Code-Verified Explanation

## 1. Purpose and scope

This document explains how Zemen-ePOS communicates with Ethiopia's Ministry of Revenue (MoR) Electronic Invoice Management System (EIMS/EIRMS). It is based on both `required.md` and the current source code.

It distinguishes three different statements:

- **Implemented** — the current source code contains the complete application flow.
- **Configuration-dependent** — the code supports it, but it works only after valid external credentials, certificates, URLs, infrastructure, or environment variables are supplied.
- **Not implemented / external evidence required** — the source code does not provide it, or it must be delivered and certified by MoR, INSA, the hosting provider, or an auditor.

This distinction matters. A successful MoR login proves that the credentials and authentication endpoint accepted the request. It does not by itself prove that certificate onboarding, invoice registration, every compliance test, production accreditation, hosting compliance, or the INSA audit has passed.

## 2. High-level architecture

The browser never communicates directly with MoR and never receives MoR secrets.

```text
Merchant user
    |
    | HTTPS to Zemen-ePOS web/API
    v
Zemen-ePOS API
    |-- validates user, role, merchant and branch
    |-- validates invoice/receipt business data
    |-- reads branch credentials and signing material from Vault
    |-- obtains/caches the branch's MoR token
    |-- builds the authoritative MoR payload
    |-- signs it when the configured MoR gateway is HTTPS
    |-- sends it to MoR
    |-- records an outbound audit event
    |-- persists accepted fiscal data and related stock/accounting effects
    v
MoR EIMS API
```

The important isolation unit is the **branch**:

- Each branch has its own MoR credentials.
- Each branch has its own private key and INSA certificate.
- Each branch has its own cached access/refresh token.
- Invoice and receipt counters are branch-specific.
- Cancellation and verification use the credentials of the branch that originally registered the document.
- A sibling branch's certificate or sequence must not be reused.

## 3. System identities and responsibilities

### 3.1 Platform Super Admin

The Super Admin manages platform-level onboarding and merchant approval. A Super Admin is not the seller and should not use one global MoR identity for every merchant.

The Super Admin may:

- review merchant registration information and legal documents;
- approve or reject merchant registration;
- create merchants or users when explicitly assigning the correct tenant;
- configure or support branch onboarding when authorized;
- inspect platform audit information.

The Super Admin's own login credentials are Zemen-ePOS credentials, not the merchant's MoR credentials.

### 3.2 Merchant Admin

The Merchant Admin manages the merchant and its branches. They are responsible for ensuring that the merchant/branch information exactly matches MoR's registered enterprise data.

They may:

- update merchant legal identity and contact information;
- create and manage branches;
- enter each branch's MoR `clientId`, `clientSecret`, and `apikey`;
- use the branch connection test;
- complete the certificate request wizard;
- download the CSR and certificate request form;
- send the request to the configured INSA address;
- upload the returned INSA certificate;
- manage merchant users and their branch access;
- view merchant-wide reports while writes remain branch-attributed.

### 3.3 Branch users

Cashiers and other branch-pinned roles operate within the branch contained in their authenticated request context. That context determines:

- which MoR account is used;
- which system number and token are used;
- which invoice/receipt sequence is used;
- which sales-floor stock is affected;
- which audit tenant owns the event.

## 4. Required external material

Before a branch can perform real MoR operations, it needs:

| Item | Source | Current use |
|---|---|---|
| Merchant TIN | Taxpayer/MoR | Login and seller identity |
| Source/system number | MoR | JWT identity and outgoing payloads |
| Source type | MoR | Current implementation fixes this to `POS` |
| Client ID | MoR | `/auth/login` |
| Client secret | MoR | `/auth/login` |
| API key | MoR | `/auth/login` |
| RSA private key | Generated per branch | Signs HTTPS requests; remains in Vault |
| CSR | Generated from branch identity | Sent to INSA |
| INSA certificate/chain | INSA | Attached to signed requests |
| MoR base URL | MoR/environment owner | Selects the gateway |

These values must belong to the same taxpayer/source system. Mixing a TIN, system number, credential set, private key, or certificate from different registrations will cause authentication or signature failures.

## 5. Where secrets are stored

### 5.1 HashiCorp Vault

The application stores branch secrets under a merchant-specific Vault KV v2 mount:

```text
m-<merchantId>/data/branches/<branchId>/eirms
    clientId
    clientSecret
    apikey

m-<merchantId>/data/branches/<branchId>/signing
    privateKeyPem
    certPem
```

The PostgreSQL branch record contains non-secret configuration and readiness metadata. API responses expose only boolean flags such as whether a credential/key/certificate is configured; they do not return secret values.

### 5.2 Vault application authentication

The API authenticates to Vault using AppRole files:

```text
/vault/approle/role-id
/vault/approle/secret-id
```

`vault-init` provisions the policy and AppRole. It validates an existing role/secret pair and rotates it when it is stale. Vault tokens are cached and renewed before expiry.

Vault audit records deliberately redact credential, private-key and certificate bodies. A Vault read never writes the returned secret into the application audit response body.

### 5.3 Important deployment warning

The Compose Vault configuration is suitable for controlled development and integration testing. Production compliance still requires an approved hardened Vault/HSM/TPM design, protected unseal material, backup/recovery procedures, key rotation, restricted operator access and auditable operational controls.

## 6. Branch certificate onboarding

### 6.1 Automatic key and CSR generation

When certificate onboarding is provisioned, the service:

1. loads the merchant and branch;
2. refuses to generate a real CSR if the merchant TIN is missing/bootstrap-only;
3. creates a branch RSA private key if one does not already exist;
4. stores the private key in Vault;
5. constructs and stores a CSR and onboarding state;
6. generates a pre-filled certificate request form.

CSR subject mapping:

| CSR field | Source |
|---|---|
| `C` | Ethiopia (`ET`) |
| `ST` | configured/default state |
| `L` | configured/default locality |
| `O` | merchant legal name |
| `OU` | branch/establishment name |
| `CN` | merchant TIN |
| `serialNumber` | branch system number |
| `emailAddress` | onboarding contact email |

The private key is not included in the CSR, DOCX form, email attachment, API response, or frontend state.

### 6.2 Sending to INSA

The Merchant Admin downloads:

- `request.csr`;
- the pre-filled certificate request form `.docx`.

They send these to the certificate-request address displayed by the wizard and then mark the request as submitted. The code default is `icr@insa.gov.et`, configurable through `EIRMS_CERTIFICATE_EMAIL`. `required.md` states `ica@insa.gov.et`; this discrepancy must be confirmed with INSA before production submission. Do not rely on either address without official confirmation.

### 6.3 Uploading the returned certificate

When the INSA PEM is uploaded, the backend verifies:

- the certificate is parseable;
- its public key matches the branch's private key;
- its subject CN matches the expected merchant TIN;
- certificate dates can be read;
- the stored signing pair can produce a valid signature.

The certificate and existing private key are stored together in Vault. The signing cache is invalidated so the next MoR request immediately reads the new material.

### 6.4 Certificate runtime validation

Before signing, the integration rejects:

- missing private key;
- missing certificate;
- invalid PEM;
- certificate not valid yet;
- expired certificate.

Signing material is cached per merchant/branch for five minutes. Rotation is therefore picked up within the cache window, and certificate upload explicitly clears the relevant cache immediately.

### 6.5 RSA key-size discrepancy

`required.md` says **3024-bit RSA**, while `certificate-signer.ts` currently generates **2048-bit RSA** and its code comment says the referenced guide requires 2048-bit RSA. This is a real compliance decision that must be resolved against the latest official INSA specification. The system must not be declared compliant until the approved key size is confirmed and the generator/tests/documentation agree.

## 7. MoR authentication flow

### 7.1 Login request

For the selected branch, the backend loads:

- `clientId`, `clientSecret`, `apikey` from Vault;
- TIN from the merchant database.

Logical request:

```json
{
  "clientId": "branch-client-id",
  "clientSecret": "branch-client-secret",
  "apikey": "branch-api-key",
  "tin": "merchant-tin"
}
```

It sends this to:

```text
POST {EIRMS_BASE_URL}/auth/login
Content-Type: application/json
```

If the configured base URL is HTTPS, this logical request is first wrapped in the signed envelope described in section 8.

### 7.2 Login response and token cache

The expected successful envelope contains:

```json
{
  "status": "SUCCESS",
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "encryptionKey": "...",
    "expiresIn": 3600
  }
}
```

The service caches tokens **in application memory per branch**. It decodes non-secret JWT claims to obtain:

- TIN;
- system type;
- system number;
- preferred username/client identity;
- expiry information.

Tokens are never returned to the browser. Concurrent requests for the same branch share one in-flight login/refresh promise, preventing a login storm.

### 7.3 Refresh

When a token is within 60 seconds of expiry, the service calls:

```text
POST /auth/refresh-token
```

with the refresh token. If refresh fails, it falls back to a fresh `/auth/login`. The refreshed response may replace the cached encryption key; otherwise the previous key is retained.

### 7.4 Connection test

The branch “Test MoR login” action clears the branch token cache and forces a real login. It returns only:

- success;
- TIN claim;
- system type claim;
- system number claim.

Therefore “MoR login succeeded” is a real upstream authentication result, not a mock, provided `EIRMS_BASE_URL` points to the real configured MoR gateway. It does not register an invoice.

## 8. Request signing and transport

### 8.1 Signed HTTPS envelope

For an HTTPS MoR base URL, the backend sends:

```json
{
  "request": { "the": "logical payload" },
  "signature": "base64 RSA-SHA512 signature",
  "certificate": "base64 certificate file"
}
```

Signing steps implemented by `eirms-signer.ts`:

1. Serialize the logical request with `JSON.stringify(request)`.
2. Sign those UTF-8 bytes using RSA-SHA512 (SHA512withRSA, PKCS#1 v1.5).
3. Base64-encode the signature.
4. Base64-encode the complete certificate file.
5. Send the original request object and both Base64 strings.

### 8.2 Key-order warning

The statement in `required.md` that JSON key order does not matter is unsafe for this implementation. A digital signature covers bytes, and different key order produces different `JSON.stringify` bytes. The code relies on constructing the object once and allowing Axios/JavaScript to serialize that same object consistently. Do not sort, reconstruct, mutate or serialize the signed object differently after signing.

### 8.3 HTTP gateway behavior

When `EIRMS_BASE_URL` begins with `http://`, the code sends the bare logical payload without the signed envelope. Production configuration normally requires HTTPS, but the configuration currently permits the specifically allow-listed `http://core.mor.gov.et` host.

This exception is a material security/compliance risk. It exists for compatibility with the known MoR gateway behavior, but official production authorization and network protection must be documented. Credentials and fiscal data should not traverse unencrypted public HTTP.

### 8.4 Authorization header

After login, fiscal calls include:

```text
Authorization: Bearer <branch access token>
Content-Type: application/json
```

### 8.5 Encryption key status

The authentication service receives and caches MoR's `encryptionKey`, and exposes an internal getter. No invoice, receipt, cancellation or verification code currently uses it to encrypt a payload. Therefore **payload encryption using the returned encryption key is not implemented**.

### 8.6 mTLS status

The application implements certificate-based **message signing**. That is not the same as mutual TLS. The Axios clients do not configure a client TLS agent/certificate for an mTLS handshake. If MoR/INSA requires application-managed mTLS, that remains to be implemented or provided and evidenced at an approved reverse proxy/gateway.

## 9. Invoice registration workflow

### 9.1 Local API and permission

The frontend sends an invoice to:

```text
POST /invoices
Permission: invoice.create
Rate limit: 60 requests per 60 seconds per authenticated user/identifier
```

This local endpoint is not the MoR endpoint. The backend validates and transforms the request, then calls MoR `/v1/register`.

### 9.2 Validation before MoR

Before any MoR call, the backend:

- resolves and pins the merchant/branch tenant;
- requires an active, approved merchant;
- validates DTO fields and enumerations;
- validates memo amount rules;
- prevents mixed goods/services where MoR expects one nature;
- requires a harmonization code when excise is present;
- verifies that a supplied cart reservation belongs to the caller;
- applies the branch stock policy and prevents invalid overselling;
- normalizes the issue date so it is not unparseable or impermissibly in MoR's future;
- requires branch credentials and, for HTTPS, signing material;
- derives the next branch document number/invoice counter;
- reads the previous accepted IRN for chain continuity.

### 9.3 Authoritative field sources

The client cannot authoritatively choose all fiscal identity fields:

| Payload field | Authoritative source |
|---|---|
| Merchant/branch | authenticated request context or validated `branchId` |
| Seller TIN | MoR JWT identity |
| System number/type | MoR JWT identity |
| Document number | server's branch sequence |
| Invoice counter | server's branch sequence |
| Previous IRN | last local accepted IRN for that branch |
| Seller legal/contact data | merchant and branch database records, with explicit permitted overrides |
| Buyer and item data | validated sale input/inventory snapshots |

This prevents a cashier from freely substituting another merchant's TIN, system number or counter.

### 9.4 MoR invoice payload

The backend builds:

```json
{
  "TransactionType": "B2B | B2C | B2G",
  "BuyerDetails": {},
  "DocumentDetails": {
    "Type": "INV | CRE | DEB | ...",
    "Date": "MoR formatted date",
    "DocumentNumber": "server sequence"
  },
  "ItemList": [],
  "PaymentDetails": {},
  "ReferenceDetails": {
    "PreviousIrn": "last branch IRN or empty",
    "RelatedDocument": null
  },
  "SellerDetails": {},
  "SourceSystem": {
    "CashierName": "...",
    "InvoiceCounter": 1,
    "SalesPersonName": "...",
    "SystemNumber": "from MoR JWT",
    "SystemType": "POS"
  },
  "ValueDetails": {},
  "Version": "1"
}
```

For walk-in B2C buyers, empty optional fields are omitted rather than sending placeholder TIN values. For credit/debit memos, only changed lines are sent, original line numbers are retained, totals are recomputed on the server, and `RelatedDocument` links the original IRN.

### 9.5 Upstream call and sequence recovery

The backend calls:

```text
POST {EIRMS_BASE_URL}/v1/register
```

If MoR returns a sequence error containing the expected document number/counter, the service:

1. parses the expected values;
2. waits five seconds to avoid immediate rate limiting;
3. rebuilds the payload;
4. retries once.

Other errors are not blindly retried, reducing duplicate-registration risk.

### 9.6 Successful response and persistence

The expected accepted result contains values such as:

- IRN;
- accepted document number;
- acknowledgement date;
- MoR status;
- signed QR;
- signed invoice.

Only after MoR accepts the document does the service persist the final invoice, buyer snapshot, line items, request/response evidence, seller/branch identity and sequence.

For an `INV`, it then records the sale stock movement against the branch sales-floor store and releases the trusted cart reservation. For `CASH + IMMIDIATE`, the invoice is stored as paid without creating a redundant separate sales receipt. Finally, a buyer notification job is enqueued.

Important transaction boundary: MoR acceptance happens before local persistence. The code validates stock before MoR to reduce failure risk, but a database outage after MoR acceptance can still create a reconciliation incident. Operations need monitoring and a recovery procedure for accepted-upstream/missing-local cases.

## 10. Sales receipt workflow

### 10.1 Local API

```text
POST /receipts
Permission: receipt.create
Rate limit: 60/minute
Upstream: POST /v1/receipt/sales
```

### 10.2 Preconditions

The service:

- requires at least one invoice;
- requires an active merchant;
- ensures every invoice belongs to the merchant;
- requires all invoices in one receipt to belong to one branch;
- prevents non-admin branch users from settling another branch's invoice;
- rejects cancelled invoices;
- rejects already-paid invoices;
- prevents cumulative overpayment;
- selects the issuing invoice's branch token, certificate and receipt sequence.

### 10.3 Payload

The payload includes generated receipt number/counter, EAT timestamp, currency, collected amount, seller TIN, invoice IRNs and payment transaction details. `ModeOfPayment` is the instrument accepted by MoR (for example CASH, CHEQUE, CARD, SWIFT or bank transfer), not the local invoice classification of CASH/ADVANCE/CREDIT.

### 10.4 Persistence

After MoR success, the service stores MoR's receipt identifier, RRN, signed QR and status, plus the raw logical request/response. In one database transaction it links invoice payments and updates each invoice to `PARTIAL` or `PAID`. It then enqueues the receipt notification.

Receipt counter drift is corrected with the same one-retry/five-second approach as invoices.

## 11. Withholding receipt workflow

```text
POST /receipts/withhold
Permission: withholding.create
Rate limit: 30/minute
Upstream: POST /v1/receipt/withholding
```

The user supplies an external supplier invoice IRN, currency/exchange rate, withholding type, pre-tax amount, withholding amount and optional supplier snapshot.

Implemented withholding types are `TWTH` and `IWTH`. The code defaults a missing stored rate to 3 percent, but it sends `null` upstream when the input rate is omitted. The exact allowed codes and calculation rules must be verified against the current MoR schema.

Because the supplier invoice may not exist locally, no local invoice-payment link is created. The external IRN and supplier identity are stored directly on the withholding receipt.

## 12. Verification and external import

### 12.1 Local invoice verification

```text
POST /invoices/:id/verify
Permission: invoice.view
Upstream: POST /v1/verify
Body: { "irn": "stored invoice IRN" }
```

The token/certificate comes from the branch that originally registered the invoice. This is a passive check; the endpoint returns MoR's authoritative response without rewriting local state.

### 12.2 Receipt verification

```text
POST /receipts/:id/verify
Permission: receipt.view
Rate limit: 30/minute
Upstream: POST /v1/verify
Body: { "irn": "stored receipt RRN" }
```

Receipts use the RRN as the verification reference.

### 12.3 External IRN lookup/import

- `POST /invoices/lookup-external` performs read-only MoR verification.
- `POST /invoices/import-from-irn` verifies and imports a non-local active invoice into the merchant tenant.
- Import is idempotent by IRN.
- Cancelled/non-active invoices are refused for payment workflows.
- Tenant-specific branch authentication prevents unrestricted cross-merchant lookup.

## 13. Invoice cancellation

```text
POST /invoices/:id/cancel
Permission: invoice.update
Rate limit: 30/minute
Upstream: POST /v1/cancel
```

Upstream payload:

```json
{
  "Irn": "stored MoR IRN",
  "ReasonCode": "1 | 2 | 3 | 4",
  "Remark": "operator explanation"
}
```

The service rejects an already-cancelled invoice locally, then uses the original invoice branch's credentials and certificate. Only after MoR accepts cancellation does a database transaction:

- store the cancellation evidence;
- mark the invoice `CANCELLED`;
- reverse the exact sale stock movements in their original stores;
- add compensating stock ledger entries.

The system then enqueues a cancellation notification.

Single cancellation is implemented. Bulk cancellation is not implemented.

## 14. Offline drafts

Invoice drafts exist but are disabled by default behind `DRAFTS_ENABLED`.

When enabled:

- a failed/unavailable live registration can be saved locally as a draft;
- a worker/operator can later sync it to `/v1/register`;
- counters are recomputed at sync time;
- sequence drift receives one corrected retry;
- successful sync creates the real invoice and deletes the draft;
- failure marks the draft `SYNC_FAILED` for controlled retry.

Offline drafting is not the same as an officially accredited fiscal offline mode. Approval requires documented limits, timestamps, ordering, immutable queue behavior, recovery rules and MoR test evidence.

## 15. Error handling and auditability

### 15.1 User-facing errors

MoR error shapes are normalized into messages such as:

- Buyer TIN must be a valid digit length.
- Next document number should be N.
- Receipt currency must match the invoice currency.
- This invoice has already been cancelled.
- Seller details do not match enterprise data.

Raw Axios/network failures become controlled 502/503 application errors. Missing credentials, missing certificate, inactive merchant, invalid branch and Vault outage have explicit reason codes/messages.

### 15.2 Audit records

Authentication and fiscal upstream calls record:

- action and MoR path;
- logical request body;
- response body;
- HTTP status;
- success/failure;
- duration;
- actor/merchant/branch request context where available.

Secrets stored in Vault are redacted from audit bodies. However, invoice/receipt logical payloads and raw fiscal responses contain taxpayer/customer information. Database encryption, access restrictions and retention controls remain mandatory.

`EIRMS_LOG_PAYLOADS=1` logs complete payloads for diagnostics. This should remain disabled in production unless an approved, access-controlled and redacted logging procedure exists.

## 16. Security controls implemented in application code

| Control | Status |
|---|---|
| Role-based permissions | Implemented for invoice, receipt, withholding, branch, certificate and audit actions |
| Tenant/branch scoping | Implemented in request context and database queries |
| Per-branch Vault secrets | Implemented |
| Secret redaction in Vault audit calls | Implemented |
| RSA-SHA512 request signing | Implemented for HTTPS gateway |
| Certificate/key match and CN validation | Implemented |
| Certificate validity-date checks | Implemented before signing |
| Access/refresh token cache | Implemented per branch |
| MFA/OTP login workflow | Implemented in the application authentication layer; deployment/policy enforcement must be verified |
| Rate limiting | Implemented globally and on sensitive/fiscal routes using Redis when available |
| Friendly upstream error translation | Implemented |
| Fiscal outbound audit events | Implemented |
| Tokenized public document links | Implemented using server-side HMAC secret |
| TLS termination | Configuration/infrastructure-dependent |
| TLS 1.3 enforcement | Not proven by application source alone |
| mTLS | Not implemented in the Axios integration unless external infrastructure supplies it |
| Payload encryption with MoR encryption key | Not implemented |
| HSM/TPM private-key storage | Not implemented by the current Compose setup; Vault software storage is used |
| WORM/immutable audit storage | Not implemented/proven |
| Database AES-256 at rest | Hosting-provider/infrastructure evidence required |
| Ninety-day audit retention | Not clearly enforced for application audit rows |
| Secure boot/debug lockdown/firmware/OTA | Hardware/deployment controls, outside this web application |

## 17. Compliance coverage against `required.md`

| Requirement | Current status |
|---|---|
| Single invoice registration | Implemented |
| Bulk invoice registration | Not implemented |
| Sales receipt | Implemented |
| Withholding receipt | Implemented |
| Single cancellation | Implemented |
| Bulk cancellation | Not implemented |
| Invoice verification | Implemented |
| Receipt verification | Implemented using RRN |
| OAuth-like MoR login/JWT | Implemented |
| Refresh token | Implemented |
| SHA512withRSA signing | Implemented for HTTPS |
| Certificate wizard | Implemented |
| INSA certificate upload validation | Implemented |
| Callback endpoint for bulk operations | Not implemented |
| Encryption-key handling | Cached only; payload encryption missing |
| SMS notifications | Notification architecture must be checked/configured; email is implemented, but production delivery evidence is external |
| Email notifications | Implemented/configuration-dependent |
| Thermal/normal print layouts | Implemented in frontend document views; formal device test evidence required |
| Offline mode | Draft mechanism exists behind a disabled flag; not enough by itself to claim accreditation |
| Audit logging | Implemented, but immutability/retention accreditation remains |
| MFA | Implemented in current authentication work; policy and end-to-end production testing required |
| Per-merchant rate limiting | User/IP and tenant context are present; confirm exact accreditation interpretation and load behavior |
| Ethiopia/Tier III/two data centres | Infrastructure evidence required |
| INSA security audit | External certification required |
| MoR sandbox/compliance tests | External execution and signed results required |

## 18. Known documentation/code decisions to resolve

Before accreditation, obtain written clarification for:

1. **RSA key length:** `required.md` says 3024; code generates 2048.
2. **INSA email:** `required.md` says `ica@insa.gov.et`; code defaults to `icr@insa.gov.et`.
3. **Canonical JSON:** code signs insertion-ordered `JSON.stringify`; do not claim key order is irrelevant.
4. **HTTP gateway exception:** confirm whether production use of `http://core.mor.gov.et` is officially permitted and protected.
5. **mTLS:** determine whether message signing alone is accepted or an mTLS client certificate is mandatory.
6. **Encryption key:** obtain the official payload encryption algorithm/fields and implement them if mandatory.
7. **Withholding codes:** code uses `TWTH`/`IWTH`; `required.md` example uses `TWHT`. Confirm the exact MoR enumeration.
8. **Certificate renewal period:** track the official expiry/renewal rule rather than assuming exactly two years for every issued certificate.
9. **Bulk endpoints/callback contract:** implement and test if accreditation requires them.
10. **Audit immutability and retention:** define WORM/retention implementation and provide evidence.

## 19. Controlled real-integration test procedure

Do not issue an uncontrolled invoice until MoR confirms whether the configured URL is sandbox or production.

Recommended sequence:

1. Confirm the official test base URL in writing.
2. Confirm the credential set belongs to the merchant TIN/source number.
3. In Merchant Admin, select the intended branch.
4. Verify merchant legal name, email, phone, VAT, region and wereda exactly match MoR enterprise records.
5. Add the branch credentials and run “Test MoR login.”
6. Complete certificate onboarding and upload the matching INSA PEM if the HTTPS endpoint requires signing.
7. Confirm the branch readiness view shows credentials, system number, key and certificate.
8. Create a controlled B2C VAT invoice with a low-value test item and no buyer TIN (IRC-P01).
9. Record its returned IRN, QR, acknowledgement date and local audit event.
10. Verify the invoice using the application's MoR verify action.
11. Create a B2B invoice using an officially valid buyer TIN/legal name (IRC-P02).
12. Run the invalid-TIN negative case and confirm rejection is friendly and no local final invoice/stock movement is created (IRC-N08).
13. For a credit sale, record a sales receipt and verify its RRN (IRC-P03).
14. Test cancellation in the authorized environment and verify stock reversal (IRC-P05).
15. Test credit and debit memos against an accepted original invoice (IRC-P06/P07).
16. Preserve request IDs, timestamps, audit events and MoR responses as test evidence without exposing secrets.

If MoR rejects seller phone/email with “Mismatched fields,” update the merchant record to exactly match MoR's enterprise profile. Do not invent values or override them merely to bypass validation.

## 20. Production readiness checklist

### Application and MoR

- [ ] Official environment URL confirmed as sandbox or production.
- [ ] Each branch has its own correct credential set.
- [ ] Merchant seller identity exactly matches MoR records.
- [ ] Approved RSA key length confirmed and code aligned.
- [ ] CSR address and submission procedure confirmed with INSA.
- [ ] Certificate/key/TIN/system-number relationship verified.
- [ ] Certificate renewal alerts and operating procedure tested.
- [ ] All required positive and negative MoR cases passed.
- [ ] Bulk registration/cancellation implemented if mandatory.
- [ ] Encryption-key algorithm implemented if mandatory.
- [ ] mTLS implemented/evidenced if mandatory.
- [ ] Reconciliation procedure exists for upstream-accepted/local-persist-failed incidents.

### Security and operations

- [ ] Production traffic uses approved TLS 1.3-capable infrastructure.
- [ ] Vault is hardened, backed up and protected by approved unseal/key custody.
- [ ] HSM/TPM requirement is satisfied or formally waived.
- [ ] Database/storage encryption evidence is available.
- [ ] Audit logs are immutable and retained for the required period.
- [ ] Backups and restoration are tested.
- [ ] MFA is enforced for required administrative roles.
- [ ] Production secrets are absent from Git, images, logs and frontend bundles.
- [ ] `EIRMS_LOG_PAYLOADS` is disabled in production.
- [ ] Monitoring alerts cover MoR authentication, 4xx/5xx, sequence drift, certificate expiry and Vault health.
- [ ] Data-centre location, Tier III, public IP, redundancy and replication evidence is available.

## 21. Practical interpretation

The current system has a substantial real MoR integration: per-branch credential isolation, real login/token refresh, signed HTTPS envelopes, invoice registration, sales and withholding receipts, cancellation, verification, sequence recovery, local fiscal persistence, stock effects, notifications, audit records and certificate onboarding.

It should not yet be described as fully compliant with every item in `required.md`. Bulk operations, payload encryption, application-level mTLS, immutable retention, infrastructure certification and several official specification discrepancies remain unresolved or require external evidence. The correct claim is: **the principal single-document integration flows are implemented, while full accreditation remains dependent on specification confirmation, missing controls, deployment hardening and formal MoR/INSA testing.**
