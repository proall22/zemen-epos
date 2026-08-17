• I’ll compare this checklist line-by-line against the implemented code and classify each requirement as implemented,
partial, absent, or dependent on deployment/external accreditation. I’ll pay special attention to places where the
guide may conflict with the actual EIRMS contract, such as RSA key size, INSA email, withholding enums, token refresh,
bulk endpoints and security claims.

• Ran Write-Output '---SIGNING/AUTH---'; Get-Content apps/api/src/eirms/eirms-signer.ts; Get-Content apps/api/src/eirms/
│ eirms-auth.service.ts | Select-Object -First 280; Get-Content apps/api/src/eirms/eirms.config.ts; Write-Output
│ '---CERTIFICATE GENERATION---'; rg -n -C 5 "modulusLength|generateKey|rsa|sha512|canonical|
│ … +5 lines
└
Id Name PSJobTypeName State HasMoreData Location Command
… +1406 lines (ctrl + t to view transcript)
apps/api/src\status\status.service.ts:73: ...notificationState(internal.checks.redis),
apps/api/src\status\status.service.ts:98:export function notificationState(check: HealthCheck): {

✔ You approved codex to run Write-Output '---INVOICE ENUMS/DTO---'; Get-Content apps/api/src/invoices/dto... this time

• Ran Write-Output '---INVOICE ENUMS/DTO---'; Get-Content apps/api/src/invoices/dto/document-details.dto.ts; Get-Content
│ apps/api/src/invoices/dto/create-invoice.dto.ts; Get-Content apps/api/src/invoices/dto/invoice-item.dto.ts;
│ Get-Content apps/api/src/invoices/dto/payment-details.dto.ts; Get-Content apps/api/src/invoices/dto/
│ … +5 lines
└
Id Name PSJobTypeName State HasMoreData Location Command
… +626 lines (ctrl + t to view transcript)
apps/api/src\reports\reports.module.ts:27: 'REPORTS_ENABLED=true requires NOTIFICATIONS_ENABLED=true —
scheduled reports deliver through the notifications mail client.',

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• No—the system follows many core EIRMS integration requirements, but it is not yet fully compliant with the complete
checklist you provided.

More importantly, parts of that guide conflict with the contract currently implemented and tested in this repository.
Before changing cryptography or certificate submission details, the authoritative MoR/INSA document version must be
confirmed.

## Overall assessment

Compliance area Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Single invoice registration Implemented
──────────────────────────────────────── ──────────────────────────────────────────────────────────
Bulk invoice registration Not implemented
──────────────────────────────────────── ──────────────────────────────────────────────────────────
Sales receipts Implemented
──────────────────────────────────────── ──────────────────────────────────────────────────────────
Withholding receipts Implemented
──────────────────────────────────────── ──────────────────────────────────────────────────────────
Single invoice cancellation Implemented
──────────────────────────────────────── ──────────────────────────────────────────────────────────
Bulk cancellation Not implemented
──────────────────────────────────────── ──────────────────────────────────────────────────────────
Invoice/receipt verification Implemented
──────────────────────────────────────── ──────────────────────────────────────────────────────────
EIRMS login and token refresh Implemented
──────────────────────────────────────── ──────────────────────────────────────────────────────────
SHA512withRSA signing Implemented
──────────────────────────────────────── ──────────────────────────────────────────────────────────
Certificate onboarding Implemented, but key size/email conflict with your guide
──────────────────────────────────────── ──────────────────────────────────────────────────────────
Secure secret storage Implemented using Vault, not HSM/TPM
──────────────────────────────────────── ──────────────────────────────────────────────────────────
Merchant/branch isolation Implemented
──────────────────────────────────────── ──────────────────────────────────────────────────────────
Role-based access control Implemented
──────────────────────────────────────── ──────────────────────────────────────────────────────────
MFA Not implemented
──────────────────────────────────────── ──────────────────────────────────────────────────────────
Email notifications Implemented but configuration-dependent
──────────────────────────────────────── ──────────────────────────────────────────────────────────
SMS notifications Implemented but configuration-dependent
──────────────────────────────────────── ──────────────────────────────────────────────────────────
Offline drafts/synchronization Implemented behind a disabled feature flag
──────────────────────────────────────── ──────────────────────────────────────────────────────────
Thermal and normal printing Implemented in the frontend
──────────────────────────────────────── ──────────────────────────────────────────────────────────
Immutable/WORM fiscal logs Not implemented
──────────────────────────────────────── ──────────────────────────────────────────────────────────
TLS 1.3 enforcement Not proven by this repository
──────────────────────────────────────── ──────────────────────────────────────────────────────────
Ethiopian data-center compliance Deployment-dependent and not proven
──────────────────────────────────────── ──────────────────────────────────────────────────────────
Accreditation documents/security audit Not included as completed accreditations

# 1. Digital certificate compliance

## What is implemented

The system has a complete per-branch certificate workflow:

1. Merchant or branch is approved.
2. The backend generates an RSA private key.
3. The private key is stored in Vault.
4. A CSR is generated.
5. The user downloads:
   - request.csr
   - request-form.docx

6. The user emails both documents to INSA.
7. The user records that the request was sent.
8. INSA returns a PEM certificate.
9. The user uploads the PEM.
10. The backend verifies that the certificate’s public key matches the stored private key.
11. Certificate CN, serial number and validity dates are recorded.
12. The private key and certificate are used to sign EIRMS requests.

A bring-your-own-key migration path is also implemented.

## Important conflict: RSA key size

Your guide requires:

3024-bit RSA

The current implementation generates:

2048-bit RSA

The code comment says the guide used when implementing the repository specified RSA-2048.

Therefore, this is not something that should be changed blindly. RSA 3024 is also an unusual modulus size; common
sizes are 2048, 3072 and 4096.

Required action:

- Check the exact current official INSA certificate integration specification.
- Confirm whether it says 2048, 3024, or 3072.
- Confirm this with the INSA certificate authority before changing production key generation.
- Add a contract test locking the approved value.

Until that is confirmed, this requirement is classified as a compliance discrepancy.

## Important conflict: INSA email

Your guide says:

ica@insa.gov.et

The implemented system defaults to:

icr@insa.gov.et

The system allows the address to be configured through:

EIRMS_CERTIFICATE_EMAIL

This must be resolved using an authoritative current INSA document or written INSA confirmation. Do not rely on either
address merely because it appears in an informal summary.

## Certificate renewal

The application stores and displays certificate validity dates. However, it does not currently implement a complete
renewal-management workflow with:

- automatic expiration reminders;
- renewal task generation;
- scheduled email warnings;
- certificate revocation management;
- enforced two-year renewal policy;
- administrator renewal dashboard.

Therefore renewal tracking is partial.

## HSM/TPM requirement

The application uses HashiCorp Vault for private keys and branch secrets.

That is better than storing plaintext keys in PostgreSQL or returning them to the browser, but Vault software storage
is not automatically equivalent to:

- Hardware Security Module;
- TPM-backed non-exportable keys;
- PKCS#11 signing;
- certified key custody.

Current private keys are stored as exportable PEM material inside Vault.

If HSM/TPM storage is mandatory, the signing architecture must be changed so the private key remains non-exportable
and signing occurs through the hardware/key-management interface.

# 2. Authentication

## Implemented EIRMS authentication

The system implements:

POST /auth/login
POST /auth/refresh-token

Authentication is per branch because each branch carries its own:

- client ID;
- client secret;
- API key;
- merchant TIN;
- system identity;
- signing key and certificate.

Tokens are cached per branch. Before expiration, the system attempts refresh. If refresh fails, it falls back to a
fresh login.

The response handling supports:

- access token;
- refresh token;
- encryption key;
- expiration time.

## Signed authentication

When the EIRMS base URL uses HTTPS, authentication requests are wrapped as:

{
"request": {},
"signature": "...",
"certificate": "..."
}

When configured against the HTTP test gateway, the code permits a bare request.

For production compliance, HTTP should not be allowed. The production configuration should fail startup unless:

- EIRMS URL is HTTPS;
- signing key is configured;
- certificate is configured.

## Internal application authentication

Zemen-ePOS user authentication separately implements:

- email and password login;
- bcrypt password hashing;
- access JWT;
- rotating refresh-token cookies;
- password reset;
- logout/session revocation;
- repeated-login lockout;
- HttpOnly cookies;
- permission and tenant guards.

However, MFA is not implemented.

# 3. Digital signing

The signing implementation uses:

RSA-SHA512
PKCS#1 v1.5
Base64 signature
Base64 certificate file

The signed bytes are:

JSON.stringify(request)

The request is sent in the signed envelope with the same object construction order.

## Problem in the supplied guide

The guide says:

> JSON key order does NOT matter—signature is based on serialized string content.

Those two statements conflict.

If the signature is calculated over the serialized JSON string, key order generally does matter:

{"a":1,"b":2}

and:

{"b":2,"a":1}

are semantically equivalent JSON objects but different byte strings and produce different signatures.

The repository avoids drift by:

1. constructing the request in a stable order;
2. signing JSON.stringify(request);
3. sending the same object through the same JavaScript serialization behavior.

That matches the real signed fixture included in the repository, but it is not a standards-based canonical JSON
algorithm such as RFC 8785.

The exact MoR signing rule should be confirmed before rewriting this.

# 4. Invoice registration

## Single registration

Implemented through:

POST /v1/register

The local frontend talks to Zemen-ePOS; the backend validates, signs and forwards to EIRMS.

Implemented transaction types:

- B2B
- B2C
- B2G

Your guide additionally mentions:

- G2B
- G2C

Those are not accepted by the current CreateInvoiceDto.

## Implemented invoice content

The system handles:

- transaction type;
- buyer information;
- document details;
- invoice lines;
- quantity and unit price;
- nature of supplies;
- tax codes;
- pre-tax values;
- tax values;
- excise values;
- totals;
- currency;
- payment classification;
- payment terms;
- branch and seller identity;
- source-system information;
- inventory references;
- reference/original invoice information;
- credit and debit memo chains.

The backend recalculates and validates authoritative totals rather than trusting all browser calculations.

## Document date format conflict

Your guide says invoice date is ISO 8601.

The current DTO documents the EIRMS value as:

DD-MM-YYYYTHH:mm:ss

This is not ordinary ISO YYYY-MM-DD.

This must be compared with the exact current MoR API schema. The existing implementation should not be changed solely
from this summary.

## Document types

The application supports normal invoices plus credit/debit memo workflows. The DTO description lists:

- INV
- CRE
- DEB
- PRF
- OVD
- INT
- RTN
- MIX
- FIN

Your guide also includes INC. The current DTO uses a string rather than a strict enum, but UI and service behavior for
every listed document type is not equally implemented. Fully accepting a string is not the same as having a tested
business workflow.

## Sequence handling

Implemented:

- branch-specific sequence;
- next sequence endpoint;
- sequence-drift detection;
- one corrected retry;
- invoice counter handling;
- document uniqueness through stored invoice state.

## Bulk registration

Not implemented:

POST /v1/bulkRegister

Also absent:

- bulk submission UI;
- conversation ID persistence;
- EIRMS bulk callback endpoint;
- callback signature/authentication validation;
- per-document callback reconciliation;
- bulk retry dashboard.

This is one of the clearest gaps against the supplied guide.

# 5. Receipt registration

## Sales receipts

Implemented through:

POST /v1/receipt/sales

The backend generates authoritative receipt identifiers and adds:

- seller TIN;
- source-system information;
- invoice IRNs;
- payment coverage;
- paid amounts;
- total amounts;
- collection amount;
- payment details.

It persists the receipt and updates linked invoice payment state.

## Payment modes

The application separates:

- EIRMS payment classification: CASH, ADVANCE, CREDIT;
- local payment instrument: cash, cheque, CPO, SWIFT, card, wire, bank transfer and letter of credit.

This distinction is sensible because the invoice payment classification and the actual settlement instrument are not
necessarily the same field.

## Withholding receipts

Implemented through:

POST /v1/receipt/withholding

The code accepts:

TWTH
IWTH

Your guide shows:

TWHT

That spelling difference must be checked against the authoritative MoR enum. Sending the wrong code would cause
production rejection.

The implementation supports:

- external invoice IRN;
- currency;
- exchange rate;
- withholding type;
- rate;
- pre-tax value;
- withholding amount;
- supplier identity.

# 6. Cancellation

## Single cancellation

Implemented through:

POST /v1/cancel

The system:

1. loads a tenant-owned accepted invoice;
2. validates cancellation state;
3. sends IRN, reason code and remark;
4. persists cancellation information;
5. marks the invoice cancelled;
6. reverses eligible sale stock movements;
7. queues buyer notifications.

## Bulk cancellation

Not implemented:

POST /v1/bulkCancel

Missing work includes:

- bulk cancellation endpoint;
- batch validation;
- batch UI;
- callback/status reconciliation if asynchronous;
- partial failure handling;
- audit and retry views.

# 7. Verification

Implemented through EIRMS:

POST /v1/verify

The system supports:

- verifying a stored invoice;
- finding an invoice by IRN;
- checking an external invoice;
- importing an externally registered invoice;
- verifying receipts by RRN;
- public tokenized invoice and receipt pages;
- QR-based document access.

This portion substantially follows the guide.

# 8. Security requirements

## Implemented security controls

The repository implements:

- role-based access control;
- tenant scoping;
- branch grants;
- Super Admin consent scopes;
- password hashing;
- rotating refresh sessions;
- login lockout;
- reset-token lifecycle;
- HttpOnly refresh cookies;
- Helmet HTTP security headers;
- strict request-size limits;
- DTO allow-listing;
- rejection of unknown request fields;
- rate limiting;
- Turnstile support;
- CORS allow-listing;
- audit logging;
- Vault secret storage;
- credential redaction;
- webhook signature verification;
- branch-specific signing material;
- public-link signing;
- health monitoring;
- Redis-backed jobs;
- Sentry/Prometheus/Loki/Grafana integration.

## Not implemented or not proven

The repository does not establish:

- MFA for administrators;
- Secure Boot;
- firmware signature verification;
- firmware encryption;
- UART/JTAG/SPI lockdown;
- tamper-resistant hardware;
- TPM/HSM-backed signing;
- mTLS to EIRMS;
- AES-256 database encryption controlled by this application;
- WORM/immutable fiscal logs;
- signed secure timestamps;
- signed OTA updates;
- anti-rollback firmware controls;
- device application allow-listing;
- command-line lockdown.

Several of those are device or infrastructure requirements, not ordinary React/NestJS application features. They must
be handled by deployment architecture and accredited hardware where applicable.

## TLS 1.3

The application uses HTTPS-compatible clients, and SMS configuration requires HTTPS. However:

- local Docker endpoints are plain HTTP;
- the repository does not itself prove production TLS termination settings;
- EIRMS configuration currently permits HTTP for test environments;
- mTLS is not implemented.

Therefore “TLS 1.3+ enforced everywhere” cannot currently be claimed.

## Audit retention

Observability configuration retains Loki logs for approximately 90 days and Prometheus metrics for 90 days.

However:

- Loki retention is not WORM storage;
- application audit-table retention is not explicitly enforced as a legal retention policy;
- administrators with infrastructure access may potentially modify/delete ordinary storage;
- fiscal-record legal retention is not documented as an enforced lifecycle.

# 9. Data and infrastructure compliance

## Merchant isolation

Implemented using shared tables with mandatory merchantId and branch scoping.

This is logical tenant partitioning, not:

- separate schemas for every merchant;
- separate database for every merchant;
- per-merchant database encryption keys.

Vault uses merchant/branch-specific secret paths, which is good isolation for credentials.

## Rate limiting

The system has user/IP throttling. It does not clearly implement an independent quota bucket per merchant as demanded
by your guide.

## Backups

The repository includes backup/restore scripts, but the local PostgreSQL backup service is disabled because the
deployment uses Neon.

That means compliance depends on:

- Neon backup configuration;
- retention settings;
- point-in-time recovery;
- restore testing;
- documented recovery time and recovery point objectives.

The repository alone does not prove recovery tests were performed.

## Ethiopian data centers

Nothing in the source proves:

- the database is hosted in Ethiopia;
- the application is hosted in an Ethiopian Tier III data center;
- replication exists across two Ethiopian data centers;
- registered Ethiopian public IPs are used;
- redundant EIRMS communication links exist.

The current logs/configuration indicate a Neon database endpoint in a US-East AWS region. If Ethiopian data residency
is mandatory, that deployment is likely non-compliant and must be moved after confirming the rule’s exact scope.

# 10. Notifications

Implemented notification events include:

- invoice registration;
- invoice cancellation;
- credit/debit memo events;
- receipt events;
- merchant signup/approval/rejection state changes.

Email uses a queued delivery pipeline. SMS uses a separate queue and gateway so an SMS retry does not resend email.

However, both features are configuration-dependent:

NOTIFICATIONS_ENABLED
SMS_ENABLED

A code implementation is not proof that production credentials, sender domains, templates and delivery tests are
complete.

# 11. Offline capability

Offline-style invoice drafts are implemented:

- create draft;
- list drafts;
- retry synchronization;
- delete draft;
- background synchronization;
- failure attempts and error state;
- sequence recalculation during synchronization.

But the feature is disabled by default:

DRAFTS_ENABLED=false

It should therefore be described as “implemented behind a feature flag,” not as production-enabled offline compliance.

It is also not a complete hardware-offline fiscal device system. Browser caching, conflict rules, maximum offline
duration, secure local storage and accreditation behavior require additional validation.

# 12. Printing

The frontend contains:

- POS receipt documents;
- invoice print views;
- cash receipt documents;
- tax invoice variants;
- QR rendering;
- normal invoice pages;
- public document views.

This provides browser-based thermal/normal layouts, but formal printer accreditation, exact paper dimensions and test-
print approval are separate requirements.

# 13. Testing status

The repository contains unit and integration tests for important areas, including:

- signing fixtures;
- certificate/key matching;
- tenancy;
- invoice calculations;
- stock behavior;
- audit redaction;
- email/SMS helpers;
- reporting;
- health and status.

However, there is no evidence that every named official MoR checklist case has been executed and approved in the
official sandbox.

Missing evidence includes:

- signed MoR test report;
- complete IRC test-case mapping;
- official bulk test cases;
- security penetration-test report;
- INSA security audit approval;
- accreditation certificate;
- production readiness sign-off.

Automated tests in the repository are necessary but do not replace formal accreditation.

# 14. Documentation and accreditation

Existing repository documentation includes:

- README;
- API documentation;
- Docker runbook;
- curl examples;
- Postman collection;
- implementation and workflow documents;
- role documentation;
- inventory/store explanation.

Still missing or not formally established:

- complete SRS;
- formal software architecture/design specification;
- threat model;
- data-flow diagrams;
- key-management policy;
- backup/restore test evidence;
- disaster-recovery plan;
- open-source/IP rights statement;
- release/version compliance register;
- formal MoR integration test evidence;
- completed INSA security certificate;
- bank guarantee evidence;
- penetration-test report;
- operational incident-response plan.

# Highest-priority gaps

Before claiming full compliance, address these in this order:

1. Obtain the authoritative current MoR and INSA documents.
2. Resolve RSA 2048 versus 3024/3072.
3. Resolve icr@insa.gov.et versus ica@insa.gov.et.
4. Resolve TWTH versus TWHT.
5. Resolve invoice date format.
6. Confirm canonical serialization/key-order rules.
7. Enforce HTTPS production configuration and determine whether mTLS is required.
8. Implement bulk register, callback reconciliation and bulk cancel.
9. Implement MFA for privileged users.
10. Decide whether HSM/TPM-backed non-exportable signing is mandatory.
11. Move production data to compliant Ethiopian infrastructure if data residency is mandatory.
12. Establish encrypted backups and documented restore testing.
13. Implement immutable/WORM fiscal audit storage if required.
14. Enable and accredit notifications/offline mode.
15. Execute every official sandbox test and retain signed evidence.
16. Complete the formal accreditation-document package.

## Final conclusion

The system is a substantial, real single-document EIRMS integration. It correctly implements many core workflows: per-
branch credentials, Vault storage, certificates, RSA-SHA512 signing, authentication/refresh, invoice/receipt
registration, withholding, cancellation, verification, RBAC, tenancy, stock effects, notifications and audit logging.

It should currently be described as:

> Core single-transaction EIRMS functionality implemented, with several accreditation, bulk-processing, infrastructure
> and advanced-security requirements still outstanding.

It should not yet be described as fully compliant with the complete guide you provided. The biggest technical gaps are
bulk processing, MFA, production TLS enforcement, HSM/TPM custody, immutable logs and infrastructure/accreditation
evidence. The biggest immediate risk is changing cryptographic or enum behavior using a secondary summary that
conflicts with the contract already represented by the repository’s real signed fixture.
