Yes. With this **new EIRMS PDF**, we can make the dashboard specification much more accurate. It adds an important missing piece: **EIRMS itself is the government-side Electronic Invoice and Receipt Management System**, with Core APIs for authentication, invoice registration, cancellation, verification, sales receipts, and withholding receipts. 

That means the previous dashboard proposal needs to be tightened. In particular, **MoR/EIRMS integration is not just a generic "API connection"**. The EIRMS PDF explicitly defines invoice registration, IRN/QR-code generation, cancellation, authentication, and receipt-related functions.

Below is the stronger, combined version for **Zemen ePOS / EIRMS × Zemen-ePOS**, using the README + the previous PDFs + this new EIRMS document.

---

# 1. First: Understand the Whole System

There are actually **three layers** you should understand.

```text
┌──────────────────────────────────────┐
│        BUSINESS / MERCHANT           │
│                                      │
│  Zemen ePOS / ERP / POS              │
│  • Products                          │
│  • Inventory                         │
│  • Sales                             │
│  • Customers                         │
│  • Payments                          │
└──────────────────┬───────────────────┘
                   │
                   │ Invoice details
                   ▼
┌──────────────────────────────────────┐
│       EIRMS × ZEMEN-ePOS             │
│                                      │
│        Middleware Platform           │
│                                      │
│  • Authentication                    │
│  • Merchant management               │
│  • Invoice processing                │
│  • Queue / retry                     │
│  • Receipts                          │
│  • Audit                             │
│  • Reporting                         │
└──────────────────┬───────────────────┘
                   │
                   │ Secure API
                   ▼
┌──────────────────────────────────────┐
│       MINISTRY OF REVENUE            │
│             EIRMS                    │
│                                      │
│  • Authenticate                      │
│  • Validate invoice                  │
│  • Generate IRN                      │
│  • Generate QR Code                  │
│  • Sign invoice                      │
│  • Verify                            │
│  • Cancel                            │
│  • Receipt processing                │
└──────────────────────────────────────┘
```

The new EIRMS document explicitly shows a taxpayer system sending invoice details to EIRMS and EIRMS returning an **IRN, QR code, and signed invoice**. 

This is the foundation for your dashboard design.

---

# 2. PLATFORM ADMIN / SUPER ADMIN DASHBOARD

## Who is this person?

The Super Admin belongs to the company operating the Zemen ePOS middleware platform.

Their job isn't to sell products.

Their job is to answer:

> **"Are all merchants, integrations, invoices, users, and platform services working correctly?"**

This is an **operations dashboard**, not a sales dashboard.

---

# A. Top KPI Cards

The first row should immediately communicate platform health.

### Merchant KPIs

```text
TOTAL MERCHANTS
128

ACTIVE
113

PENDING APPROVAL
7

SUSPENDED
8
```

These are appropriate because the README explicitly defines:

* Merchant registration
* Merchant approval
* Merchant management
* Multi-tenancy

---

### Platform transaction KPIs

Second row:

```text
INVOICES TODAY
42,681

SUCCESSFULLY REGISTERED
42,310

PENDING
281

FAILED
90
```

These are **recommended dashboard metrics**, not values specified by the documents.

---

# B. Merchant Management Overview

This should be one of the first major dashboard sections.

### Merchant status

```text
Merchant Status

Active             113
Pending              7
Suspended            8
Rejected             2
```

Then:

### Recent Merchant Registrations

```text
Merchant             Date          Status

ABC Trading          Aug 11        Pending
XYZ Supermarket      Aug 10        Approved
DEF Pharmacy         Aug 10        Pending
```

Actions:

**Review**

**Approve**

**Reject**

The README explicitly identifies merchant registration and approval.

---

# C. EIRMS / MoR Integration Dashboard

This is one of the most important areas.

The EIRMS document establishes that the government system provides:

* Authentication & Authorization
* Invoice Registration
* Invoice Cancellation
* Invoice Verification
* Sales Receipt Registration
* Withholding Receipt
* IRN generation
* QR code generation
* Signed invoice generation. 

So your Super Admin dashboard should have:

## EIRMS Status

```text
EIRMS CONNECTION

● Operational

API Response
245 ms

Last Successful Request
08:39:42

Failed Requests
12

Pending Requests
34
```

---

# D. Invoice Processing Monitor

Don't just show "Invoices Today."

Show the actual processing pipeline:

```text
Invoice Processing

Received
   ↓
Validated
   ↓
Submitted
   ↓
Accepted
   ↓
IRN Generated
   ↓
QR Generated
   ↓
Signed
```

For example:

```text
Received       42,681
Processed      42,550
Pending           81
Failed            50
```

This maps much better to the EIRMS workflow than a generic sales chart.

The EIRMS document specifically states that EIRMS validates the invoice schema/content and generates the IRN, QR code, and signed invoice. 

---

# E. Queue / BullMQ Monitor

Your README says BullMQ handles background jobs.

Therefore:

```text
QUEUE STATUS

Pending Jobs       42
Processing          8
Completed       14,821
Failed             12
```

Click:

**Failed Jobs**

and show:

```text
Invoice ID
Merchant
Attempt
Error
Created
Last Retry
Next Retry
```

This is particularly important because government API communication can fail temporarily.

---

# F. System Health

The Super Admin should see infrastructure health.

```text
PostgreSQL       ● Healthy
Redis            ● Healthy
Vault            ● Healthy
EIRMS API        ● Healthy
Queue Worker     ● Healthy
Email Service    ● Healthy
```

The README explicitly identifies PostgreSQL, Redis, Vault, Sentry, Docker, BullMQ and health checks.

---

# G. Security Dashboard

Because the platform uses:

* JWT
* Refresh Tokens
* bcrypt
* RBAC
* Vault
* Audit logs

show:

```text
Security

Failed Login Attempts       14
Locked Accounts               3
Password Resets               8
Suspicious Requests           2
```

Then:

**View Audit Logs**

---

# H. Platform Audit Activity

Example:

```text
08:39  Merchant ABC approved
08:36  Invoice submission failed
08:34  User locked
08:31  Branch created
08:27  Invoice cancelled
08:22  Merchant settings updated
```

The README explicitly says important actions are logged, including login, invoice creation/cancellation, user updates and merchant updates.

---

# 3. MERCHANT OWNER / MERCHANT ADMIN DASHBOARD

This dashboard is completely different.

The merchant owner's question is:

> **"How is my business performing?"**

They should see **only their tenant's data**.

They should never see:

* other merchants
* platform-wide infrastructure
* Redis
* Vault
* other merchants' invoices
* platform queue internals

That's the point of multi-tenancy.

---

# A. Business KPI Row

First row:

```text
TODAY'S SALES
ETB 485,200

COLLECTIONS
ETB 421,800

OUTSTANDING
ETB 63,400

INVOICES
1,284
```

The User Manual explicitly mentions:

* Revenue
* Collections
* Outstanding invoices
* Active users
* Monthly comparison
* Business KPIs. 

---

# B. Revenue Performance

Large chart:

```text
Revenue

ETB
500K |                 ●
400K |        ●    ●
300K |    ●
200K | ●
     └────────────────────
       M   T   W   T   F
```

Filters:

* Today
* This week
* This month
* Custom range

---

# C. Branch Performance

If the merchant has multiple branches:

```text
Branch       Sales       Invoices

Addis        1.2M        3,821
Adama        840K        2,912
Hawassa      620K        2,104
```

This gives the owner immediate operational visibility.

---

# D. Invoice Status

Use the actual fiscal workflow:

```text
Invoice Status

Registered       4,821
Pending             82
Failed              17
Cancelled           31
```

For a better design, clicking "Failed" should show:

```text
Invoice
Error
Reason
Time
Retry Status
```

---

# E. EIRMS Compliance Status

This should be visible to the merchant owner, but **not at the same infrastructure depth as Super Admin**.

Example:

```text
Fiscal Integration

● Connected

Invoices Registered
4,821

Pending
12

Failed
3
```

Then:

**View Invoice Status**

---

# F. Inventory Overview

The merchant owner needs to know what is happening with stock.

```text
Inventory

Total Products       2,842
Low Stock               31
Out of Stock             8
Stores                   12
```

Then:

### Low Stock

```text
Milk                 8
Cooking Oil          5
Sugar               12
Soap                 6
```

---

# G. Recent Invoices

```text
Invoice       Buyer          Amount       Status

INV-00123     ABC Ltd        45,000       Registered
INV-00124     Walk-in         2,400       Registered
INV-00125     XYZ Ltd        18,500       Pending
```

---

# H. Recent Receipts

```text
RRN
Invoice
Buyer
Amount
Payment Method
Date
```

---

# I. Top Buyers

```text
Top Buyers

1. ABC Trading
2. XYZ PLC
3. DEF Enterprise
```

The User Manual explicitly mentions Top Buyers.

---

# J. Business Users

```text
Users

Total Users        48
Active             42
Locked              2
Inactive             4
```

---

# 4. CASHIER DASHBOARD

This dashboard should be **fast and task-oriented**.

The cashier doesn't need business intelligence.

Their primary objective:

> **"Serve the customer and complete the transaction correctly."**

---

# A. Primary Action

The largest button on the dashboard:

## + NEW SALE

This should be visually dominant.

Don't make the cashier hunt through a sidebar.

---

# B. Today's Activity

```text
Today's Transactions
127

Today's Sales
ETB 38,450

Items Sold
486
```

---

# C. My Recent Invoices

```text
Invoice       Buyer       Amount       Status

INV-1021      Walk-in     1,250        Registered
INV-1022      Walk-in       850        Registered
INV-1023      ABC Ltd     5,400        Pending
```

---

# D. Payment Summary

The documentation identifies:

* Cash
* Advance
* Credit

as payment methods.

So:

```text
Cash
ETB 21,400

Advance
ETB 6,850

Credit
ETB 10,200
```

---

# E. Invoice Actions

Cashier needs:

```text
+ New Sale

Search Invoice

Verify Invoice

Print Receipt
```

The EIRMS document explicitly provides invoice verification, and the User Manual describes invoice search, verification and receipt operations. 

---

# F. Invoice Status

```text
Registered
Pending
Failed
Cancelled
```

If an invoice is pending, don't simply display "Pending."

Give the cashier useful information:

```text
Invoice submission pending

You can continue serving the customer.

Status will update automatically.
```

That's a much better UX.

---

# 5. ACCOUNTANT DASHBOARD

The accountant is different again.

Their question:

> **"What was invoiced, what was collected, what remains outstanding, and what fiscal records need attention?"**

---

# A. Financial KPI Row

```text
TOTAL INVOICED
ETB 8.2M

COLLECTED
ETB 6.7M

OUTSTANDING
ETB 1.5M

WITHHOLDING
ETB 420K
```

The exact numbers are illustrative.

---

# B. Invoice vs Collection

Show two related values:

```text
Invoice Value
ETB 8.2M

Collection
ETB 6.7M

Outstanding
ETB 1.5M
```

This immediately tells the accountant:

> "We invoiced ETB 8.2M but only collected ETB 6.7M."

---

# C. Outstanding Invoices

This should be one of the most important widgets.

```text
Invoice     Buyer        Total       Paid       Balance

INV-1001    ABC PLC      80,000      50,000     30,000
INV-1002    XYZ Ltd      45,000       0         45,000
```

---

# D. Receipt Overview

```text
Receipts Today

Count
428

Total
ETB 1.8M
```

Recent receipts:

```text
RRN
Invoice
Buyer
Amount
Payment Method
Date
```

---

# E. Withholding Receipt

This is particularly important because the EIRMS Core Module explicitly includes **Withholding Receipt** functionality. 

Dashboard:

```text
WITHHOLDING

This Month
ETB 420,000

Pending
ETB 35,000

Processed
ETB 385,000
```

Again, the exact statuses/metrics should be confirmed against your implementation.

---

# F. Tax / Fiscal Overview

Possible dashboard section:

```text
Fiscal Documents

Sales Invoices
Credit Notes
Debit Notes
Sales Receipts
Withholding Receipts
Cancelled Invoices
```

The EIRMS document explicitly identifies invoice registration, cancellation, verification, sales receipt registration and withholding receipt APIs. 

---

# G. Reports

Quick actions:

```text
Sales Reports

Invoice Reports

Receipt Reports

Tax Reports

Inventory Reports
```

The README explicitly lists sales, inventory and tax reports.

---

# 6. IMPORTANT: INVOICE FLOW

This is where your entire product starts making sense.

Suppose a customer buys a television.

---

## Step 1: Cashier creates sale

```text
Cashier
   ↓
Select Product
   ↓
Quantity
   ↓
Buyer
   ↓
Payment
```

---

## Step 2: Zemen ePOS validates the transaction

Backend checks:

* Product exists
* Quantity available
* Required invoice data exists
* User is authorized
* Merchant is active

---

## Step 3: Invoice is sent to EIRMS

The EIRMS document shows:

```text
Taxpayer System

      │
      │ Invoice Details
      ▼

     EIRMS
```

EIRMS validates schema and invoice content. 

---

# 7. EIRMS RETURNS THE FISCAL INFORMATION

EIRMS generates:

### IRN

**Invoice Reference Number**

This uniquely identifies the registered invoice.

### QR Code

Used for invoice verification.

### Signed Invoice

The fiscal system provides the signed invoice.

The EIRMS document explicitly states that these are generated after successful validation. 

---

# 8. Customer Receives Invoice

Final result:

```text
Invoice

IRN
QR Code
Signed Invoice
Amount
Tax
Buyer
Seller
Items
```

The EIRMS transaction flow explicitly shows the buyer receiving the IRN, QR code and signed invoice. 

---

# 9. INVOICE CANCELLATION

This is another important workflow.

Suppose the cashier made a serious mistake.

They request:

```text
IRN
+
Reason Code
+
Remark
```

Example:

```text
IRN:
d0b10c49...

ReasonCode:
1

Remark:
Repeated Error
```

EIRMS validates the cancellation request.

If valid:

```text
Cancellation Confirmed
```

The new EIRMS document explicitly states that cancellation may happen automatically according to predefined daily/monthly time limits or manually, and that the request contains IRN, ReasonCode and Remark. 

---

# 10. AUTHENTICATION FLOW

Before a taxpayer system can communicate securely with EIRMS:

```text
Taxpayer System
      │
      │ Client ID
      │ Client Secret
      │ API Key
      │ TIN
      ▼
    EIRMS
      │
      ▼
Access Token
+
Refresh Token
```

The EIRMS authentication API explicitly shows these credentials and token generation. 

This is why your platform needs secure secret management.

---

# 11. What the Super Admin sees vs Merchant Owner

This distinction is critical.

### Super Admin sees:

```text
ALL MERCHANTS
       ↓
ALL BRANCHES
       ↓
ALL PLATFORM TRANSACTIONS
       ↓
EIRMS CONNECTION
       ↓
QUEUE
       ↓
SYSTEM HEALTH
       ↓
AUDIT
```

### Merchant Owner sees:

```text
MY BUSINESS
       ↓
MY BRANCHES
       ↓
MY USERS
       ↓
MY PRODUCTS
       ↓
MY INVENTORY
       ↓
MY SALES
       ↓
MY INVOICES
       ↓
MY RECEIPTS
       ↓
MY REPORTS
```

### Cashier sees:

```text
MY SALES
       ↓
MY INVOICES
       ↓
PAYMENTS
       ↓
RECEIPTS
```

### Accountant sees:

```text
INVOICES
       ↓
PAYMENTS
       ↓
RECEIPTS
       ↓
OUTSTANDING
       ↓
WITHHOLDING
       ↓
REPORTS
```

That's how your multi-tenant RBAC should translate into UX.

---

# 12. One very important correction to the previous design

The new EIRMS PDF makes it clear that you should **not present the system simply as "a POS connected to the government."**

That's too shallow.

The real product story is:

> **Zemen ePOS provides the merchant's operational environment, while EIRMS × Zemen-ePOS provides the secure integration and management layer between merchant systems and Ethiopia's EIRMS.**

EIRMS itself provides the government-side core functions for authentication, invoice registration, cancellation, verification, sales receipts and withholding receipts. 

And the government workflow is based on **real-time validation/clearance**, not merely storing invoices for later review. The document explicitly contrasts the post-audit model with the clearance model, where the tax authority validates or clears the invoice before it is issued. 

That distinction should be reflected in your product explanation, architecture diagram, invoice UI, status indicators, and dashboard.

---

# 13. The ideal navigation for each dashboard

### Super Admin

```text
Dashboard
Merchants
Branches
Users
Invoices
Receipts
EIRMS
Queue
Reports
Audit Logs
System Health
Settings
```

### Merchant Admin

```text
Dashboard
Point of Sale
Invoices
Receipts
Inventory
Products
Categories
Stores
Purchasing
Vendors
Reports
Users
Branches
Settings
```

### Cashier

```text
Dashboard
New Sale
Invoices
Receipts
Customers
```

Keep it simple.

### Accountant

```text
Dashboard
Invoices
Receipts
Payments
Withholding
Credit Notes
Debit Notes
Reports
Audit / History
```

---

# 14. The single most important design rule

Your dashboard shouldn't answer:

> "What information can we put on the screen?"

It should answer:

> **"What decision does this user need to make next?"**

For each role:

| Role               | Dashboard question                                                |
| ------------------ | ----------------------------------------------------------------- |
| **Super Admin**    | Is the platform and EIRMS integration healthy?                    |
| **Merchant Owner** | Is my business performing well?                                   |
| **Cashier**        | Can I complete this customer's sale quickly?                      |
| **Accountant**     | What was invoiced, collected, outstanding, and fiscally recorded? |

If a widget doesn't help answer that question, **remove it**.

That is the difference between a dashboard that merely looks impressive and one that is actually useful.
