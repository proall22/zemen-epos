# Zemen-ePOS compliance comparison against the Complete E-Invoice Compliance Guide

## Executive conclusion

Zemen-ePOS follows many core EIRMS requirements, but it does **not** yet satisfy the complete compliance guide in full.

The system is a substantial, real single-document EIRMS integration. It implements per-branch credentials, Vault-backed secret storage, certificate onboarding, RSA-SHA512 signing, authentication and token refresh, invoice and receipt registration, withholding, cancellation, verification, tenant isolation, role-based access, inventory effects, notifications and audit logging.

It should currently be described as:

> Core single-transaction EIRMS functionality implemented, with several accreditation, bulk-processing, infrastructure and advanced-security requirements still outstanding.

It should not yet be advertised as fully compliant until the conflicts and missing controls in this document are resolved and official accreditation evidence is obtained.

Some statements in the supplied guide conflict with the contract implemented and tested in this repository. The authoritative, current MoR and INSA specifications must be obtained before changing cryptography, certificate submission details, enum values or date formats.

## Overall assessment

| Compliance area | Status |
|---|---|
| Single invoice registration | Implemented |
| Bulk invoice registration | Not implemented |
| Sales receipts | Implemented |
| Withholding receipts | Implemented |
| Single invoice cancellation | Implemented |
| Bulk cancellation | Not implemented |
| Invoice and receipt verification | Implemented |
| EIRMS login and token refresh | Implemented |
| SHA512withRSA request signing | Implemented |
| Certificate onboarding | Implemented, with key-size/email conflicts requiring confirmation |
| Secure secret storage | Implemented using Vault, not HSM/TPM |
| Merchant and branch isolation | Implemented |
| Role-based access control | Implemented |
| MFA | Not implemented |
| Email notifications | Implemented but configuration-dependent |
| SMS notifications | Implemented but configuration-dependent |
| Offline drafts and synchronization | Implemented behind a disabled feature flag |
| Thermal and normal printing | Implemented in the frontend |
| Immutable/WORM fiscal logs | Not implemented |
| TLS 1.3 enforcement | Not proven by this repository |
| Ethiopian data-center compliance | Deployment-dependent and not proven |
| Formal accreditation documents | Not present as completed accreditations |

# 1. Digital certificate compliance

## Implemented certificate workflow

The system implements a per-branch certificate workflow:

1. A merchant and branch are approved.
2. The backend generates an RSA private key.
3. The private key is stored in HashiCorp Vault.
4. A CSR is generated for the branch.
5. The user downloads `request.csr`.
6. The user downloads `request-form.docx`.
7. The user emails both files to INSA.
8. The user marks the request as submitted.
9. INSA returns a PEM certificate.
10. The user uploads the PEM using the same certificate wizard.
11. The backend verifies that the certificate public key matches the private key stored in Vault.
12. The certificate CN, serial number, validity start and validity end are recorded.
13. The private key and issued certificate are used to sign EIRMS requests.

A bring-your-own-key path is also implemented for migration from a pre-existing certificate. The backend verifies the supplied private key and certificate before accepting them.

## RSA key-size conflict

The supplied compliance guide requires:

```text
3024-bit RSA
```

The current implementation generates:

```text
2048-bit RSA
```

The implementation comment states that the INSA guide used during development required RSA-2048.

RSA `3024` is also an unusual key size. Common RSA sizes are 2048, 3072 and 4096.

Required action:

1. Obtain the exact current official INSA certificate-generation document.
2. Confirm whether the required size is 2048, 3024 or 3072.
3. Obtain written confirmation from INSA before changing production key generation.
4. Add a contract test locking the confirmed key size.
5. Define how existing certificates will be migrated if a different key size is mandatory.

Until confirmed, this remains a compliance discrepancy and must not be changed using an informal summary alone.

## INSA email conflict

The supplied guide says certificate requests must be emailed to:

```text
ica@insa.gov.et
```

The implemented system defaults to:

```text
icr@insa.gov.et
```

The destination is configurable through:

```text
EIRMS_CERTIFICATE_EMAIL
```

Required action:

- Verify the active address using the current authoritative INSA document or written INSA confirmation.
- Configure the production environment to the confirmed address.
- Keep staging/rehearsal environments pointed to a non-production inbox.

## Certificate renewal

The application stores and displays certificate validity dates. It does not yet provide a full certificate-renewal lifecycle.

Missing renewal functionality includes:

- automatic expiry reminders;
- renewal task creation;
- scheduled warning emails;
- certificate-revocation tracking;
- enforced two-year renewal policy;
- renewal status dashboard;
- escalation for expired or soon-to-expire branches.

Certificate renewal is therefore partially implemented.

## HSM/TPM requirement

Private keys and certificates are stored in HashiCorp Vault rather than PostgreSQL or browser storage. API responses never return the secrets; they expose readiness flags only.

This is secure application-level secret management, but software-based Vault storage is not automatically equivalent to:

- a Hardware Security Module;
- TPM-backed non-exportable keys;
- PKCS#11 remote signing;
- certified cryptographic key custody.

Current keys are exportable PEM material stored in Vault. If HSM/TPM storage is mandatory, the signing design must be changed so that:

- private keys are generated or imported into approved hardware;
- keys remain non-exportable;
- signing occurs through the HSM/TPM interface;
- key rotation and revocation are auditable;
- backup and disaster recovery meet cryptographic custody requirements.

# 2. Authentication implementation

## EIRMS authentication

The system implements:

```text
POST /auth/login
POST /auth/refresh-token
```

Authentication is per branch because every branch has its own:

- client ID;
- client secret;
- API key;
- merchant TIN context;
- system number and system identity;
- signing key and issued certificate.

Tokens are cached per branch. Before a token expires, the backend attempts refresh. If refresh fails, the service falls back to a fresh login.

The response handling supports:

- access token;
- refresh token;
- encryption key;
- expiration duration.

## Signed EIRMS authentication

When the configured EIRMS base URL uses HTTPS, authentication is wrapped in the signed envelope:

```json
{
  "request": {},
  "signature": "base64 signature",
  "certificate": "base64 certificate"
}
```

The repository also permits a bare body when pointed at an HTTP test gateway.

Production hardening still required:

- enforce HTTPS EIRMS URL in production;
- fail production startup when signing material is missing;
- reject accidental HTTP production configuration;
- confirm whether mutual TLS is separately required;
- verify certificate-chain and hostname validation requirements.

## Zemen-ePOS user authentication

The application's own user authentication implements:

- email/password login;
- bcrypt password hashing;
- access JWTs;
- rotating refresh-token cookies;
- HttpOnly refresh cookies;
- password reset;
- logout and token revocation;
- repeated-login lockout;
- session revocation after sensitive account changes.

MFA is not implemented.

# 3. Digital signing

The system signs EIRMS requests using:

```text
RSA-SHA512
PKCS#1 v1.5
Base64-encoded signature
Base64-encoded INSA certificate file
```

The exact signed bytes are produced with:

```ts
JSON.stringify(request)
```

The request object is sent in the envelope using the same JavaScript serialization behavior.

## Key-order issue in the supplied guide

The supplied guide says:

> JSON key order does not matter—signature is based on serialized string content.

Those statements conflict. If signing is performed over serialized JSON bytes, key order normally matters.

These objects have the same semantic data but different serialized bytes:

```json
{"a":1,"b":2}
```

```json
{"b":2,"a":1}
```

They will normally produce different signatures.

The repository prevents drift by:

1. constructing request properties in a stable order;
2. signing `JSON.stringify(request)`;
3. transmitting the same object through the same serialization behavior;
4. testing against a real INSA-signed fixture.

This is not formal canonical JSON such as RFC 8785. The exact MoR rule must be confirmed before replacing it with a different canonicalization algorithm.

# 4. Invoice registration

## Single invoice registration

Implemented upstream integration:

```text
POST /v1/register
```

The frontend sends business data to Zemen-ePOS. The backend:

1. resolves merchant and branch context;
2. verifies that the merchant and branch are active;
3. loads branch credentials and certificate material;
4. validates the document and business rules;
5. calculates authoritative totals;
6. validates stock and POS reservation ownership;
7. obtains the branch EIRMS token;
8. signs and sends the request;
9. retries once when EIRMS reports sequence drift;
10. persists the accepted document;
11. consumes inventory and records stock movements;
12. queues buyer notifications.

## Transaction types

Implemented transaction types:

- B2B;
- B2C;
- B2G.

The supplied guide additionally lists:

- G2B;
- G2C.

Those two transaction types are not accepted by the current invoice DTO.

## Implemented invoice content

The system handles:

- transaction type;
- buyer details;
- document details;
- document number and sequence;
- item line numbers;
- product descriptions and item codes;
- nature of supplies;
- units, quantities and unit prices;
- discounts;
- excise values;
- tax codes and tax amounts;
- pre-tax and total-line amounts;
- harmonization codes;
- invoice totals and currency;
- payment classifications and terms;
- seller and branch identity;
- source-system identity;
- cashier and salesperson information;
- original-document references;
- credit/debit memo relationships;
- local inventory references and stock effects.

The backend does not simply trust totals calculated by the browser. It validates and recalculates business values.

## Date-format conflict

The supplied guide describes the document date as ISO 8601.

The current DTO documents the EIRMS format as:

```text
DD-MM-YYYYTHH:mm:ss
```

This differs from ordinary ISO ordering:

```text
YYYY-MM-DDTHH:mm:ss
```

The exact current MoR API schema must be checked before changing this behavior.

## Document types

The DTO description lists:

- INV;
- CRE;
- DEB;
- PRF;
- OVD;
- INT;
- RTN;
- MIX;
- FIN.

The supplied guide also lists `INC`.

The current wire DTO uses a string rather than a strict enum. Accepting an arbitrary string does not mean every document type has a complete, tested frontend and business workflow. Normal invoices and credit/debit memo chains are the most clearly implemented workflows.

## Sequence and uniqueness

Implemented controls include:

- branch-specific sequences;
- next-sequence endpoint;
- per-cashier invoice counter;
- sequence-drift detection;
- one corrected EIRMS retry;
- locally stored document uniqueness and IRN state;
- branch identity stamped on documents.

## Bulk invoice registration

Not implemented:

```text
POST /v1/bulkRegister
```

Missing bulk functionality:

- bulk-submission API;
- bulk-upload frontend;
- callback endpoint;
- callback authentication/signature verification;
- conversation ID persistence;
- per-document callback reconciliation;
- partial-success and partial-failure handling;
- bulk retry and monitoring dashboard;
- bulk-specific rate limiting and audit reporting.

# 5. Receipt registration

## Sales receipts

Implemented upstream integration:

```text
POST /v1/receipt/sales
```

The backend adds or derives:

- authoritative receipt number;
- receipt counter;
- seller TIN;
- source-system identity;
- linked invoice IRNs;
- payment coverage;
- paid and remaining amounts;
- collection amount;
- currency and exchange rate;
- payment transaction details.

After EIRMS accepts the receipt, the system persists it and updates payment state on linked invoices.

## Payment classification and instrument

The implementation separates:

1. EIRMS payment classification:
   - CASH;
   - ADVANCE;
   - CREDIT.
2. Local payment instrument:
   - CASH;
   - CHEQUE;
   - CPO;
   - SWIFT;
   - CARD;
   - WIRE;
   - BANK_TRANSFER;
   - LETTER_OF_CREDIT.

This distinction prevents the invoice payment classification from being confused with the settlement channel.

## Withholding receipts

Implemented upstream integration:

```text
POST /v1/receipt/withholding
```

The implementation supports:

- external source-invoice IRN;
- currency and exchange rate;
- withholding type;
- withholding rate;
- pre-tax amount;
- withholding amount;
- supplier identity.

## Withholding enum conflict

The implemented values are:

```text
TWTH
IWTH
```

The supplied guide shows:

```text
TWHT
```

The exact official enum spelling must be confirmed. Sending the wrong value would cause EIRMS validation failure.

# 6. Invoice cancellation

## Single cancellation

Implemented upstream integration:

```text
POST /v1/cancel
```

The system:

1. loads a tenant-owned accepted invoice;
2. checks whether cancellation is permitted;
3. sends IRN, reason code and remark;
4. persists the cancellation;
5. marks the invoice cancelled;
6. reverses eligible sale stock movements;
7. queues buyer email/SMS notifications when configured.

## Bulk cancellation

Not implemented:

```text
POST /v1/bulkCancel
```

Missing work includes:

- bulk-cancellation endpoint;
- batch frontend;
- batch validation;
- asynchronous status/callback handling where required;
- partial-failure reconciliation;
- retry controls;
- bulk audit reports.

# 7. Invoice and receipt verification

Implemented upstream integration:

```text
POST /v1/verify
```

The application supports:

- verification of a stored invoice;
- lookup by IRN;
- checking an external invoice;
- importing an externally registered invoice;
- receipt verification by RRN;
- signed/tokenized public invoice and receipt links;
- QR-based document access;
- neutral not-found handling for invalid public tokens.

This area substantially follows the supplied guide.

# 8. Security controls

## Implemented controls

The repository implements:

- role-based access control;
- merchant isolation;
- branch grants and pinned branch context;
- Super Admin consent scopes;
- password hashing;
- rotating refresh sessions;
- login lockout;
- password-reset lifecycle;
- HttpOnly refresh cookies;
- Helmet security headers;
- request body-size limits;
- DTO field allow-listing;
- rejection of unknown fields;
- user/IP throttling;
- Turnstile support;
- CORS allow-listing;
- inbound and outbound audit logging;
- Vault-backed secret storage;
- audit and response secret redaction;
- webhook signature verification;
- per-branch signing material;
- signed public-document links;
- database, Redis, Vault, EIRMS and queue health checks;
- queued background processing;
- Sentry, Prometheus, Loki and Grafana integrations.

## Controls not implemented or not proven

The repository does not establish:

- MFA for administrators;
- Secure Boot;
- bootloader signature verification;
- firmware encryption;
- UART/JTAG/SPI lockdown;
- physical tamper protection;
- TPM/HSM-backed signing;
- mutual TLS to EIRMS;
- application-controlled AES-256 database encryption;
- immutable/WORM fiscal logs;
- secure signed timestamping;
- signed OTA updates;
- firmware anti-rollback;
- device software allow-listing;
- command-line lockdown.

Several of these are infrastructure, operating-system, device or hardware requirements rather than React/NestJS application features. They require accredited deployment architecture and evidence outside this repository.

## TLS 1.3

The application can call HTTPS services, and the SMS gateway configuration requires HTTPS. However:

- local Docker endpoints use HTTP;
- production TLS termination is not defined/proven here;
- EIRMS configuration permits HTTP for test environments;
- mTLS is not implemented;
- the repository does not prove a TLS 1.3-only external load balancer.

Therefore, TLS 1.3 enforcement cannot currently be claimed from this repository alone.

## Audit retention and immutability

The observability configuration retains Loki logs for approximately 90 days and Prometheus metrics for 90 days.

This does not equal WORM compliance because:

- Loki storage is not inherently immutable;
- application audit-table retention is not expressed as an enforced legal lifecycle;
- privileged infrastructure administrators may be able to modify/delete ordinary storage;
- legal fiscal-record retention is not defined as an enforced policy;
- no external immutable archive is configured.

# 9. Infrastructure and tenant requirements

## Merchant isolation

The system uses shared PostgreSQL tables with mandatory merchant and branch ownership. Service and request-context layers restrict operations to the authenticated tenant and granted branch.

This is logical tenant partitioning, not:

- separate database schema per merchant;
- separate database per merchant;
- per-merchant PostgreSQL encryption key.

Vault does use merchant/branch-specific secret paths, which provides meaningful secret isolation.

## Rate limiting

The system implements user/IP throttling. It does not clearly implement a distinct quota bucket and configured limit for each merchant.

If the aggregator rules require per-merchant rate limits, a merchant-aware throttling key and quotas must be implemented and tested.

## Backup and recovery

The repository contains backup and restore scripts. The local PostgreSQL backup service is disabled because the current deployment uses Neon.

Compliance therefore depends on external configuration and evidence for:

- automatic Neon backups;
- retention period;
- point-in-time recovery;
- encrypted backup storage;
- restore testing;
- recovery time objective;
- recovery point objective;
- disaster-recovery exercises.

Source code alone does not prove that restore testing has occurred.

## Ethiopian data-center requirements

The repository does not prove:

- Ethiopian data residency;
- Tier III Ethiopian hosting;
- two Ethiopian data centers;
- registered Ethiopian public IP addresses;
- redundant EIRMS communication links;
- sufficient accredited bandwidth.

The observed database configuration points to a Neon/AWS US-East endpoint. If Ethiopian fiscal-data residency is mandatory, that deployment is likely non-compliant and must be moved after confirming the exact legal requirement and affected data classes.

# 10. Notifications

Implemented notification events include:

- invoice registration;
- invoice cancellation;
- credit memo;
- debit memo;
- receipt registration;
- merchant signup;
- merchant approval;
- merchant rejection and status changes.

Email notifications use a background queue. SMS notifications use a separate queue so an SMS retry does not resend email.

Notification operation depends on:

```text
NOTIFICATIONS_ENABLED
SMS_ENABLED
```

Production compliance additionally requires:

- configured and verified sender domain;
- valid email/SMS gateway credentials;
- approved templates;
- correct buyer contact capture;
- delivery and failure monitoring;
- retry and dead-letter handling verification;
- official notification test execution.

Implemented code is not by itself proof that the production channels are enabled and accredited.

# 11. Offline capability

The system implements invoice-draft functionality:

- create draft;
- list drafts;
- delete draft;
- synchronize draft;
- background synchronization;
- sequence recalculation before submission;
- retry-attempt tracking;
- synchronization failure state and error details.

This functionality is behind:

```text
DRAFTS_ENABLED=false
```

It should therefore be described as implemented behind a feature flag, not as production-enabled offline compliance.

Additional offline compliance questions remain:

- secure browser/local storage;
- maximum permitted offline duration;
- offline fiscal numbering rules;
- encrypted cached data;
- device clock integrity;
- conflict and duplicate prevention;
- accredited resynchronization behavior;
- recovery after browser/device loss.

# 12. Printing

The frontend includes:

- POS receipt documents;
- invoice print views;
- cash receipt documents;
- tax invoice layout variants;
- QR rendering;
- public invoice/receipt views;
- browser printing for normal and compact layouts.

Formal printer compliance still requires:

- exact mandatory-field review;
- thermal paper-size tests;
- normal paper-size tests;
- barcode and QR scan tests;
- Amharic/English rendering tests;
- official layout approval where required;
- testing on supported physical printers.

# 13. Testing status

The repository contains tests for important technical areas, including:

- EIRMS signing fixtures;
- certificate/key matching;
- tenant isolation;
- invoice/memo calculations;
- stock and cancellation behavior;
- audit redaction;
- email and SMS helpers;
- reports;
- health and public status.

The repository does not prove that every official MoR checklist case has been executed and accepted in the official sandbox.

Missing formal evidence includes:

- signed MoR sandbox test report;
- mapping from every IRC test ID to automated/manual evidence;
- official bulk test results;
- official negative-test results;
- security penetration-test report;
- INSA security audit approval;
- accreditation certificate;
- production readiness sign-off.

Automated repository tests are necessary but do not replace government or accreditation acceptance.

# 14. Documentation and accreditation

Existing repository documentation includes:

- project README;
- API documentation;
- Docker runbook;
- curl examples;
- Postman collection and environment;
- implementation/workflow audit;
- user-role documentation;
- inventory/store/vendor/purchase explanation;
- this compliance comparison.

Still missing or not formally established:

- complete Software Requirements Specification;
- formal architecture and software design specification;
- threat model;
- data-flow diagrams;
- data classification and retention policy;
- cryptographic key-management policy;
- backup/restore evidence;
- disaster-recovery plan;
- business-continuity plan;
- open-source/IP rights statement;
- system version and regulatory release register;
- formal MoR integration test report;
- completed INSA security certificate;
- bank guarantee evidence;
- penetration-test report;
- vulnerability-management policy;
- incident-response plan;
- production infrastructure accreditation evidence.

# 15. Requirement conflict register

The following conflicts must be resolved against authoritative documents:

| Area | Supplied guide | Current implementation | Required decision |
|---|---|---|---|
| RSA key size | 3024 | 2048 | Confirm official INSA requirement |
| Certificate email | `ica@insa.gov.et` | `icr@insa.gov.et` default | Confirm active INSA inbox |
| Withholding code | `TWHT` | `TWTH`, `IWTH` | Confirm official enum |
| Invoice date | ISO 8601 implied | `DD-MM-YYYYTHH:mm:ss` | Confirm exact EIRMS schema |
| JSON key order | Says it does not matter | Stable `JSON.stringify` byte order | Confirm signing/canonicalization contract |
| Transaction types | Includes G2B/G2C | B2B/B2C/B2G | Confirm required business cases |
| Security hardware | HSM/TPM | Vault PEM storage | Confirm accreditation requirement |

# 16. Highest-priority remediation plan

Before claiming full compliance, address these tasks in order:

1. Obtain the authoritative current MoR and INSA documents with version/date.
2. Resolve RSA 2048 versus 3024/3072.
3. Resolve `icr@insa.gov.et` versus `ica@insa.gov.et`.
4. Resolve `TWTH` versus `TWHT`.
5. Confirm the exact invoice date/time format.
6. Confirm signed JSON serialization and key-order rules.
7. Enforce HTTPS-only production EIRMS configuration.
8. Determine whether mTLS is required.
9. Implement bulk invoice registration.
10. Implement authenticated callback reconciliation.
11. Implement bulk cancellation.
12. Implement MFA for privileged users.
13. Determine whether HSM/TPM-backed, non-exportable signing is mandatory.
14. Implement certificate expiry alerts and renewal workflow.
15. Implement immutable/WORM fiscal audit storage if required.
16. Implement merchant-aware rate limiting if required.
17. Move production data to compliant Ethiopian infrastructure if residency is mandatory.
18. Establish encrypted backup retention and documented restore tests.
19. Enable and validate notification channels in the target environment.
20. Enable, secure and accredit offline mode if required.
21. Execute every official MoR sandbox test.
22. Retain screenshots, logs, request/response evidence and signed test results.
23. Complete the formal accreditation-document package.
24. Obtain INSA/MoR security and production approval before launch.

# 17. Pre-launch checklist status

| Requirement | Current result |
|---|---|
| Digital certificate obtained | Workflow implemented; real production certificate is operational data |
| Private key securely stored | Vault implemented; HSM/TPM not implemented |
| Client ID/secret/API key | Per-branch Vault workflow implemented |
| Authentication flow | Implemented |
| Token refresh | Implemented |
| SHA512withRSA signing | Implemented |
| Encryption-key response handling | Implemented |
| Single invoice registration | Implemented |
| Bulk invoice registration | Missing |
| Sales receipts | Implemented |
| Withholding receipts | Implemented |
| Single cancellation | Implemented |
| Bulk cancellation | Missing |
| Verification | Implemented |
| Callback endpoint | Missing for EIRMS bulk processing |
| Application audit logging | Implemented |
| Immutable audit storage | Missing |
| TLS 1.3 enforcement | Deployment evidence missing |
| MFA | Missing |
| RBAC | Implemented |
| Tenant/branch isolation | Implemented |
| Data encryption at rest | Depends on database/Vault/infrastructure configuration |
| Invoice field validation | Substantially implemented; official schema coverage needs contract testing |
| Friendly error handling | Implemented broadly; official EIRMS error mapping needs continued coverage |
| Email notifications | Implemented, feature/configuration-dependent |
| SMS notifications | Implemented, feature/configuration-dependent |
| Thermal/normal print | Implemented; accreditation testing outstanding |
| Offline drafts | Implemented but disabled by default |
| Official sandbox tests | No completed official evidence in repository |
| INSA security audit | Not proven/completed in repository |

# Final readiness statement

Zemen-ePOS currently provides a strong foundation for Ethiopian electronic invoicing and implements the main online single-document workflows. The system should proceed through a formal requirements-validation and accreditation phase before production compliance is claimed.

The largest functional gaps are:

- bulk registration;
- callback reconciliation;
- bulk cancellation;
- certificate renewal automation.

The largest security/accreditation gaps are:

- MFA;
- production TLS enforcement and mTLS confirmation;
- HSM/TPM determination;
- immutable fiscal logs;
- verified backup/restore controls;
- data-residency evidence;
- official MoR/INSA test and audit approval.

The most immediate specification risk is changing cryptographic, email, enum or date behavior based on a secondary guide that conflicts with the repository's tested EIRMS contract. Every conflict in this document must be resolved against a versioned official source before implementation changes are approved.
