# Complete E-Invoice Compliance Guide for ERP Integration

Based on all the documents you've uploaded, here is the complete set of rules, requirements, and steps you must follow to build an e-invoice module for your ERP system in Ethiopia.

---

## 📋 Overview: What You Need to Build

Your ERP's e-invoice module must handle:

| Feature                  | Description                                            |
| ------------------------ | ------------------------------------------------------ |
| **Invoice Registration** | Single & bulk submission to EIMS                       |
| **Receipt Registration** | Sales receipts & withholding receipts                  |
| **Invoice Cancellation** | Single & bulk cancellation                             |
| **Invoice Verification** | Check invoice status via IRN                           |
| **Digital Signing**      | All requests must be signed with a digital certificate |
| **Authentication**       | OAuth2-based authentication with JWT tokens            |
| **Security**             | TLS 1.3, encryption, secure storage                    |

---

## 🔐 Step 1: Obtain a Digital Certificate

### 1.1 Generate Private Key (3024-bit RSA)

```bash
openssl genpkey -algorithm RSA -out private_key.key -pkeyopt rsa_keygen_bits:3024
```

### 1.2 Create CSR Configuration File (`einvoice.cnf`)

```
[req]
default_bits = 3024
distinguished_name = req_distinguished_name
prompt = no

[req_distinguished_name]
C = ET
ST = Addis Ababa
L = Addis Ababa
O = [YOUR_ORGANIZATION_NAME]
OU = [YOUR_ORGANIZATION_UNIT]
CN = [YOUR_TIN]
serialNumber = [YOUR_SYSTEM_NUMBER]
emailAddress = your@email.com
```

### 1.3 Generate CSR

```bash
openssl req -new -key private_key.key -out csr.pem -config einvoice.cnf
```

### 1.4 Submit to INSA

Email the CSR and completed Certificate Request Form to: **ica@insa.gov.et**

### 1.5 Store Certificate Securely

- Keep private key **encrypted and secure**
- Certificate must be **renewed every 2 years** (per the guarantee letter)
- Store in a **hardware security module (HSM) or TPM** per cybersecurity requirements

---

## 🔑 Step 2: Authentication Implementation

### 2.1 Authentication Request

**Endpoint:** `POST /auth/login`

**Request Body:**

```json
{
	"request": {
		"clientId": "your_client_id",
		"clientSecret": "your_client_secret",
		"apikey": "your_api_key",
		"tin": "your_tin"
	},
	"signature": "base64_signature",
	"certificate": "base64_certificate"
}
```

### 2.2 Authentication Response

```json
{
	"data": {
		"accessToken": "jwt_token",
		"refreshToken": "refresh_token",
		"encryptionKey": "encryption_key",
		"expiresIn": 3600
	},
	"status": "SUCCESS"
}
```

### 2.3 Token Refresh

**Endpoint:** `POST /auth/refresh-token`

**Request:**

```json
{
	"refreshToken": "your_refresh_token"
}
```

---

## 📝 Step 3: Invoice Registration

### 3.1 Request Structure

Every request must follow this structure:

```json
{
	"request": {
		/* JSON data */
	},
	"signature": "Base64EncodedSignature",
	"certificate": "Base64EncodedCertificate"
}
```

### 3.2 Signing the Request

1. **Canonicalize** the JSON request object (remove whitespace)
2. **Sign** using SHA512withRSA algorithm
3. **Base64-encode** the signature
4. **Attach** the certificate

**Key Rule:** JSON key order does NOT matter—signature is based on serialized string content.

### 3.3 Minimum Required Fields for Invoice

| Field                            | Required | Description                                      |
| -------------------------------- | -------- | ------------------------------------------------ |
| `TransactionType`                | ✅       | B2B, B2C, B2G, G2B, G2C                          |
| `DocumentDetails.Type`           | ✅       | INV, CRE, DEB, INT, RTN, FIN, MIX, INC, PRF, OVD |
| `DocumentDetails.DocumentNumber` | ✅       | Sequential number                                |
| `DocumentDetails.Date`           | ✅       | ISO 8601 format                                  |
| `SellerDetails.Tin`              | ✅       | Seller's TIN                                     |
| `SellerDetails.LegalName`        | ✅       | Seller's legal name                              |
| `SellerDetails.Region`           | ✅       | Region code                                      |
| `SellerDetails.Wereda`           | ✅       | Wereda code                                      |
| `ItemList[].LineNumber`          | ✅       | Line item number                                 |
| `ItemList[].NatureOfSupplies`    | ✅       | Goods or Services                                |
| `ItemList[].UnitPrice`           | ✅       | Unit price                                       |
| `ItemList[].Quantity`            | ✅       | Quantity                                         |
| `ItemList[].Unit`                | ✅       | Unit of measure                                  |
| `ItemList[].TaxCode`             | ✅       | VAT15, VAT0, VATEX, etc.                         |
| `ItemList[].PreTaxValue`         | ✅       | Amount before tax                                |
| `ItemList[].TaxAmount`           | ✅       | Tax amount                                       |
| `ItemList[].TotalLineAmount`     | ✅       | Total line amount                                |
| `ValueDetails.TotalValue`        | ✅       | Total invoice amount                             |
| `ValueDetails.TaxValue`          | ✅       | Total tax amount                                 |
| `ValueDetails.InvoiceCurrency`   | ✅       | ETB, USD, etc.                                   |
| `PaymentDetails.PaymentTerm`     | ✅       | IMMEDIATE, etc.                                  |
| `SourceSystem.SystemType`        | ✅       | POS, MAN, CRM, EFD, SYS                          |
| `BuyerDetails.LegalName`         | ✅\*     | Required if Buyer TIN exists                     |
| `BuyerDetails.Tin`               | ✅\*     | Required for B2B, B2G transactions               |

### 3.4 Single Invoice Registration

**Endpoint:** `POST /v1/register`

**Headers:**

```
Authorization: Bearer {{token}}
Content-Type: application/json
```

### 3.5 Bulk Invoice Registration

**Endpoint:** `POST /v1/bulkRegister`

**Headers:**

```
Authorization: Bearer {{token}}
TIN: {{sellerTin}}
callback: https://your-system.com/callback
system_number: {{systemNumber}}
```

**Response:** Returns `conversationId` for async processing

**Callback Response Structure:**

```json
[
	{
		"irn": "hash_64_chars",
		"status": "A",
		"documentNumber": "123",
		"signedQR": "base64_qr",
		"signedInvoice": "base64_signed"
	},
	{
		"ruleError": [
			{
				"portion": "DocumentDetails",
				"errorMessage": ["Error message"]
			}
		],
		"status": "ERROR",
		"docNo": "124"
	},
	{
		"conversionId": "uuid"
	}
]
```

---

## 🧾 Step 4: Receipt Registration

### 4.1 Sales Receipt

**Endpoint:** `POST /v1/receipt/sales`

**Required Fields:**

```json
{
	"ReceiptNumber": "unique_id",
	"ReceiptType": "Sales Receipts",
	"Reason": "Payment for goods",
	"ReceiptDate": "2025-01-10T14:30:00.000+03:00",
	"ReceiptCounter": "12345",
	"SourceSystemType": "POS",
	"SourceSystemNumber": "SYS001",
	"ReceiptCurrency": "ETB",
	"CollectedAmount": 240,
	"SellerTIN": "your_tin",
	"Invoices": [
		{
			"InvoiceIRN": "irn_hash",
			"PaymentCoverage": "FULL",
			"InvoicePaidAmount": 240,
			"TotalAmount": 240
		}
	],
	"TransactionDetails": {
		"ModeOfPayment": "CASH",
		"CollectorName": "Jane Doe",
		"PaymentServiceProvider": "Bank",
		"AccountNumber": "123456789",
		"TransactionNumber": "TRX987654321"
	}
}
```

**ModeOfPayment Enumeration:** CASH, CHEQUE, CPO, Local Bank Transfer, SWIFT, Wire Transfer, Letter of Credit, Card

### 4.2 Withholding Receipt

**Endpoint:** `POST /v1/receipt/withholding`

```json
{
	"ReceiptNumber": "unique_id",
	"Reason": "Withhold for goods",
	"ReceiptCounter": "12345",
	"SourceSystemType": "MAN",
	"SourceSystemNumber": "SYS001",
	"InvoiceDetail": {
		"InvoiceIRN": "irn_hash",
		"Currency": "ETB",
		"ExchangeRate": null
	},
	"WithholdDetail": {
		"Type": "TWHT",
		"Rate": null,
		"PreTaxAmount": 6000,
		"WithholdingAmount": 120
	}
}
```

---

## ❌ Step 5: Invoice Cancellation

### 5.1 Single Cancellation

**Endpoint:** `POST /v1/cancel`

```json
{
	"Irn": "irn_hash_64_chars",
	"ReasonCode": "1",
	"Remark": "Duplicate entry"
}
```

**Reason Codes:**
| Code | Description |
|------|-------------|
| 1 | Duplicate |
| 2 | Data entry mistake |
| 3 | Order Cancelled |
| 4 | Others |

### 5.2 Bulk Cancellation

**Endpoint:** `POST /v1/bulkCancel`

**Request:** Array of cancellation objects

---

## ✅ Step 6: Invoice Verification

**Endpoint:** `POST /v1/verify`

```json
{
	"irn": "irn_hash_64_chars"
}
```

**Success Response:** Returns full invoice details
**Error Response:** Returns "Invoice is not registered"

---

## 🛡️ Step 7: Security Requirements (INSA Compliance)

### 7.1 Mandatory Security Controls

| Requirement                   | Implementation                                  |
| ----------------------------- | ----------------------------------------------- |
| **Secure Boot**               | Bootloader verifies firmware signatures         |
| **Firmware Encryption**       | AES-256 encryption for firmware                 |
| **Debug Interface Lockdown**  | Disable UART, JTAG, SPI ports                   |
| **TLS 1.3+**                  | All communications encrypted                    |
| **mTLS**                      | Mutual authentication with certificates         |
| **MFA**                       | Multi-factor authentication for admin access    |
| **Role-Based Access Control** | Admin, Cashier, Auditor roles                   |
| **Encryption at Rest**        | AES-256 for stored data                         |
| **Immutable Logs**            | WORM storage for invoice logs                   |
| **Secure Key Storage**        | TPM or HSM for cryptographic keys               |
| **OTA Updates**               | Signed and encrypted updates with anti-rollback |

### 7.2 Data Retention

- Audit logs retained for **≥ 90 days**
- Fiscal data stored per legal requirements
- Secure data deletion mechanisms

### 7.3 Database Requirements (Per Cybersecurity Audit)

- **Encryption at rest** for all fiscal data
- **Database backups** with recovery testing
- **Automated scheduled backups**
- **Audit trail** of all data access and modifications

---

## 📊 Step 8: Testing Requirements (MoR Compliance Checklist)

### 8.1 Invoice Registration Tests

| Test ID | Test Case         | Description                    |
| ------- | ----------------- | ------------------------------ |
| IRC-P01 | B2C Sales Invoice | Without Buyer TIN, with VAT    |
| IRC-P02 | B2B Sales Invoice | With Buyer TIN and Legal Name  |
| IRC-N08 | Invalid Buyer TIN | Negative test with invalid TIN |

### 8.2 Receipt Tests

| Test ID | Test Case        | Description                       |
| ------- | ---------------- | --------------------------------- |
| IRC-P03 | Sales Receipt    | From registered invoice           |
| IRC-P04 | Withhold Receipt | From registered invoice           |
| IRC-N09 | Invalid Invoice  | Receipt from non-existent invoice |

### 8.3 Cancellation Tests

| Test ID  | Test Case      | Description                       |
| -------- | -------------- | --------------------------------- |
| IRC-P05  | Cancel Invoice | Valid cancellation                |
| IRC-N010 | Cancel Invalid | Non-existent or already cancelled |

### 8.4 Credit/Debit Tests

| Test ID | Test Case            |
| ------- | -------------------- |
| IRC-P06 | Register Credit Memo |
| IRC-P07 | Register Debit Memo  |

### 8.5 Notification Tests

| Test ID  | Test Case            | Channel     |
| -------- | -------------------- | ----------- |
| ADD-N001 | Invoice Registration | SMS & Email |
| ADD-N001 | Cancellation         | SMS & Email |
| ADD-N001 | Receipt              | SMS & Email |

---

## 🏗️ Step 9: System Architecture Requirements

### 9.1 Infrastructure (For SaaS Providers)

- **Data center located within Ethiopia**
- **Tier III (Level 3)** design standards
- **Redundant data communication** link to EIMS
- **Registered Public IP Addresses**
- **Sufficient internet bandwidth**
- **Data replication** across ≥ 2 datacenters

### 9.2 For Aggregator Platforms

- **Merchant data isolation** (separate schemas or encrypted tenant partitioning)
- **Per-merchant encryption keys**
- **Per-merchant rate limiting** (no global throttling)
- **Merchant-specific identifiers** (TIN for each branch)
- **Traceability** at establishment and branch level

### 9.3 For On-Premise ERP

- **Deployable on client's own servers**
- **Detailed hardware/software requirements** provided
- **Database backup and recovery** mechanisms
- **Local data encryption** at rest
- **Role-Based Access Control** with granular permissions
- **Version control** for regulatory compliance

---

## 📝 Step 10: Documentation Requirements

### 10.1 Required Documents for Accreditation

| Document                                      | Description                                     |
| --------------------------------------------- | ----------------------------------------------- |
| **Software Requirements Specification (SRS)** | Detailed system description                     |
| **Software Design Documents**                 | Architecture and design                         |
| **Technology Stack List**                     | Languages, frameworks, versions                 |
| **System Version & Last Update Date**         | Version tracking                                |
| **Integration Documentation**                 | Data exchange with other systems                |
| **IP Rights Statement**                       | Third-party components/open-source              |
| **INSA Security Certificate**                 | Cybersecurity compliance                        |
| **Bank Guarantee**                            | Performance guarantee (renewable every 2 years) |

### 10.2 Compliance Checklist for Auditors

| Area                | Requirements                                               |
| ------------------- | ---------------------------------------------------------- |
| **Secure Boot**     | Signature verification, boot halting, tamper detection     |
| **Firmware**        | Encryption, signature validation, secure key storage       |
| **Hardware**        | Debug lockdown, tamper detection, physical protection      |
| **Data Security**   | Encryption at rest, no plaintext storage, retention policy |
| **Communication**   | TLS 1.3+, mTLS, insecure protocols disabled                |
| **Access Control**  | MFA, session timeout, role-based access                    |
| **Key Management**  | Secure key injection, unique keys, rotation/revocation     |
| **OTA Updates**     | Signed, encrypted, anti-rollback, logging                  |
| **Device Lockdown** | Whitelisting, command-line restriction, least privilege    |
| **Fiscal Data**     | Immutable logs, secure timestamping, offline caching       |

---

## 🔄 Step 11: Integration Checklist

### 11.1 Pre-Launch Checklist

- [ ] Digital certificate obtained from INSA
- [ ] Private key securely stored (HSM/TPM recommended)
- [ ] Client ID, Client Secret, API Key obtained
- [ ] Authentication flow implemented
- [ ] Token refresh mechanism implemented
- [ ] Payload signing implemented (SHA512withRSA)
- [ ] Encryption key handling implemented
- [ ] Invoice registration (single + bulk) implemented
- [ ] Receipt registration (sales + withholding) implemented
- [ ] Cancellation (single + bulk) implemented
- [ ] Verification implemented
- [ ] Callback endpoint ready (for bulk operations)
- [ ] Audit logging implemented
- [ ] TLS 1.3+ enforced
- [ ] MFA implemented for admin users
- [ ] Role-Based Access Control implemented
- [ ] Data encryption at rest implemented
- [ ] All invoice fields validated per schema
- [ ] All error messages properly handled
- [ ] Notification system (SMS/Email) implemented
- [ ] Print layout verified (thermal + normal printers)
- [ ] Offline mode implemented (if applicable)
- [ ] Testing passed on Sandbox environment
- [ ] All test cases from MoR checklist passed
- [ ] INSA security audit passed

### 11.2 Required Variables

| Variable       | Source      | Description                     |
| -------------- | ----------- | ------------------------------- |
| `clientId`     | MoR Portal  | API client ID                   |
| `clientSecret` | MoR Portal  | Secret key                      |
| `apiKey`       | MoR Portal  | API key                         |
| `sellerTin`    | Your TIN    | Tax Identification Number       |
| `systemNumber` | Your System | EIMS-assigned system number     |
| `systemType`   | Your System | ERP/POS/MANUAL                  |
| `certificate`  | INSA        | Digital certificate (.crt/.pem) |
| `privateKey`   | Your System | Generated private key           |

---

## ⚠️ Common Error Codes

| Error Code | HTTP Status | Description                       |
| ---------- | ----------- | --------------------------------- |
| 4400       | 401         | Invalid credentials               |
| 4408       | 401         | Invalid API key                   |
| 4409       | 401         | Invalid TIN                       |
| 67003      | 400         | Certificate expired               |
| 67008      | 400         | Certificate revoked               |
| 7015       | 406         | Invoice counter validation failed |
| 7019       | 406         | Previous IRN validation failed    |
| 7024       | 406         | Tax code validator                |
| 7001       | 406         | Document number not unique        |
| 7002       | 406         | Cancellation limit exceeded       |

---

## 🎯 Summary: What Your ERP Must Support

Your ERP e-invoice module must be:

1. **Digitally signed** – Every request signed with RSA certificate
2. **Encrypted** – TLS 1.3+ and payload encryption
3. **Auditable** – Complete audit logs for all actions
4. **Secure** – MFA, RBAC, secure key storage
5. **Tested** – All MoR test cases must pass
6. **Documented** – All required technical documentation
7. **Offline-capable** – (if applicable) Store invoices offline, sync when connected
8. **Notification-capable** – SMS/Email notifications to buyers
9. **Print-ready** – Both thermal and normal printer support
10. **Bulk-capable** – Support both single and bulk operations

---
