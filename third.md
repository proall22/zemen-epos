Yes. I checked the **E-Invoice SDD, User Manual, platform overview, and the README information you provided**. There is an important answer here:

**The documents support merchant onboarding, approval, branch provisioning, INSA certificate setup, EIRMS configuration, and activation. But they do NOT explicitly define whether the merchant owner must self-register first or whether the platform admin creates the merchant first. They also do not define SaaS subscription pricing, billing, or how money is collected from merchants.** 

So I would not falsely tell you "the PDF says the owner signs up first." It doesn't.

However, we can design the **best production SaaS flow** around what the documents actually define.

---

# 1. The best onboarding model: support BOTH

I recommend supporting **both paths**, but with one primary path.

### Primary path: Merchant Owner self-registration

```text
Merchant Owner
      ↓
Create Account
      ↓
Submit Merchant Application
      ↓
Platform Admin Reviews
      ↓
Approve / Reject
      ↓
Merchant Account Activated
      ↓
Branch Setup
      ↓
INSA Certificate
      ↓
EIRMS Configuration
      ↓
Products / Inventory / Users
      ↓
Go Live
```

### Secondary path: Platform Admin creates merchant

This is for:

* Enterprise customers
* Customers who contact your sales team
* Assisted onboarding
* Customers who cannot complete registration
* Migrating an existing business
* Large organizations where your staff performs setup

But the admin should **not create the merchant and secretly become the owner**.

Instead:

```text
Platform Admin
      ↓
Create Merchant
      ↓
Enter Business Information
      ↓
Create Owner Invitation
      ↓
Owner receives email
      ↓
Owner sets password
      ↓
Owner completes missing information
      ↓
Admin approves / activates
      ↓
Setup continues
```

This is much cleaner.

The platform's actual SDD already treats merchants as tenants and has a **merchant lifecycle, approval and branch provisioning** concept. 

---

# 2. Why I recommend Owner → Admin Approval

This is the better SaaS model.

Imagine a business called:

**ABC Trading PLC**

The owner wants to use Zemen ePOS.

They go to:

**Create Business Account**

They provide their business information.

The system creates:

```text
Application
Status = Pending Review
```

The owner **does not immediately get full operational access**.

Instead:

```text
Pending
   ↓
Admin Review
   ↓
Approved
   ↓
Setup
   ↓
Active
```

This gives Zemen ePOS control over who becomes a tenant.

That matters because your system handles:

* Taxpayer information
* TIN
* VAT information
* EIRMS credentials
* Digital certificates
* Fiscal documents
* Inventory
* Audit records

The User Manual confirms that a merchant contains legal identity information such as trade/legal name, TIN, VAT number, contact information and address. 

---

# 3. What does the owner enter during registration?

Don't make the owner fill **everything** in one giant form.

That's bad UX.

Break onboarding into stages.

---

# STAGE 1: Account Creation

The owner first creates their personal login.

```text
Full Name
Email
Phone
Password
Confirm Password
```

Then:

**Create Account**

Email verification can happen here.

The documents explicitly support authentication, password reset, lockout and role-based permissions, but they don't prescribe this exact signup form. 

---

# STAGE 2: Business Information

After account creation:

## Business identity

```text
Legal Business Name
Trade Name
TIN
VAT Number
Phone
Email
```

## Address

```text
Region
Zone
City
Woreda
Kebele
House Number
```

These fields are directly supported by the User Manual's merchant profile. 

---

# STAGE 3: Business Type

You can collect:

```text
Business Type
Industry
Number of Branches
```

For example:

```text
Retail
Restaurant
Pharmacy
Supermarket
Wholesale
Manufacturing
Other
```

**Important:** the supplied documents do not prescribe these exact industry choices. Treat this as your product-design layer, not as an existing requirement.

---

# STAGE 4: Primary Branch

The first branch should be created during onboarding.

Example:

```text
Branch Name
Addis Ababa Main Branch

Address
...

POS Device/System Number
...

Branch TIN / Fiscal Information
...
```

The SDD is very clear that the **branch is the fiscal unit**. Each branch has its own certificate, document numbering and stock context. 

That's extremely important.

Do not design the database as:

```text
Merchant
   ↓
one global certificate
```

The architecture says:

```text
Merchant
   │
   ├── Branch A
   │      ├── Certificate
   │      ├── EIRMS credentials
   │      ├── POS sequence
   │      └── Stock
   │
   ├── Branch B
   │      ├── Certificate
   │      ├── EIRMS credentials
   │      ├── POS sequence
   │      └── Stock
```

The User Manual confirms that branches have their own EIRMS credentials and POS sequence. 

---

# 4. Owner submits application

Now the owner clicks:

# Submit for Review

The system should show:

```text
Business Information       ✓
Owner Information          ✓
Primary Branch             ✓

Application Status

● Submitted
○ Under Review
○ Approved
○ Setup
○ Active
```

Then:

> **Your application has been submitted successfully.**

---

# 5. What does the Platform Admin see?

The admin dashboard gets:

## New Merchant Application

```text
ABC Trading PLC

Submitted:
11 Aug 2026

TIN:
XXXXXXXX

VAT:
XXXXXXXX

Branches:
1

Owner:
John Doe

Status:
Pending Review
```

Buttons:

### Review

### Reject

### Request Changes

### Approve

I strongly recommend adding **Request Changes**.

The documents mention approval, but they don't explicitly define this third state. It is a sensible SaaS workflow improvement.

---

# 6. What does Admin actually check?

The admin should not just press:

> APPROVE

without seeing anything.

They should have a merchant verification screen.

---

## Business Identity

```text
Legal Name
Trade Name
TIN
VAT Number
```

---

## Contact

```text
Email
Phone
Address
```

---

## Branches

```text
Branch Name
Location
POS Device
Status
```

---

## Documents / Verification

Depending on the actual legal onboarding requirements, this can contain uploaded supporting documents.

**But don't invent a list of mandatory documents from these PDFs.** The supplied documentation does not define a complete legal-document checklist.

---

# 7. Admin decision

There are three sensible outcomes.

## APPROVE

```text
Application
     ↓
Approved
```

The merchant can continue setup.

---

## REJECT

```text
Application
     ↓
Rejected
```

Admin should provide a reason.

Example:

> TIN information could not be verified.

The owner sees:

```text
Application Rejected

Reason:
...

Contact support or submit a corrected application.
```

---

## REQUEST CHANGES

This is even better.

Example:

```text
Application needs correction

Please update:
• VAT number
• Branch address
```

Owner edits.

↓

Resubmits.

↓

Admin reviews again.

---

# 8. What happens after approval?

This is where the actual fiscal onboarding begins.

Your platform overview gives a very useful high-level sequence:

```text
1. Onboarding
2. Certificate Issuance
3. Configuration
4. Go Live
5. Support
```



Let's expand that.

---

# 9. APPROVED → BRANCH SETUP

Merchant owner enters the merchant portal.

They see:

# Complete Your Setup

```text
Business Profile              ✓

Primary Branch                ✓

Certificate                   0%

EIRMS Configuration           0%

Users                         0%

Inventory                     0%

Ready for Go-Live             0%
```

This is much better UX than dumping them into an empty dashboard.

---

# 10. INSA CERTIFICATE WORKFLOW

This is one of the most important things that was missing from the simpler explanation.

The SDD explicitly defines:

```text
CSR Generation
      ↓
Certificate Request Form
      ↓
INSA
      ↓
Certificate Returned
      ↓
Upload Certificate
      ↓
Validate
```

The document says this is currently a **manual flow because there is no API for CSR issuance at present**. 

The architecture also says the certificate exchange with INSA currently happens through email and is expected to become an API later. 

---

# 11. Who handles the INSA process?

The system can automate the technical preparation:

```text
Zemen ePOS
     ↓
Generate CSR
     ↓
Generate request form
     ↓
Send / assist INSA process
     ↓
INSA returns certificate
     ↓
Upload certificate
     ↓
Validate certificate
```

The private key should **not** leave the secure secret store. The SDD explicitly states that. 

That is a serious security requirement.

---

# 12. After certificate: EIRMS Configuration

Now the branch gets configured for EIRMS.

Conceptually:

```text
Branch
  ↓
Certificate
  ↓
EIRMS Credentials
  ↓
Authentication
  ↓
Connection Test
  ↓
Configured
```

The User Manual explicitly shows branch status as:

```text
Configured
Not configured
```

and has a setup progress indicator. 

---

# 13. What happens to EIRMS credentials?

They should **not be stored in the browser**.

The architecture explicitly says the browser does not hold secrets and the API is the component that accesses the secret store and tax authority. 

The SDD specifies Vault for per-branch credentials and signing keys. 

So:

```text
Owner
   ↓
Enters configuration information
   ↓
Backend
   ↓
Vault
   ↓
Encrypted / protected credentials
```

---

# 14. Then merchant configures users

Owner/Admin creates:

```text
Cashier 1
Cashier 2
Accountant
Other authorized users
```

The User Manual says the Users page allows merchant accounts to be created, roles changed and access disabled. 

---

# 15. Then inventory setup

The merchant adds:

### Categories

```text
Food
Electronics
Clothing
```

### Products

```text
Product
SKU
UPC
Price
Tax Type
Harmonization Code
```

The platform overview explicitly identifies UPC/SKU, unit price, tax type and harmonization codes. 

---

# 16. Then stores

Example:

```text
ABC Supermarket

Branch Addis

├── Main Store
├── Cold Storage
└── Sales Floor
```

The system tracks stock per store.

The SDD says stock exists **per store**, with stock movements recorded in a ledger. 

---

# 17. Then purchasing

Merchant can record purchases.

Example:

```text
Supplier
    ↓
Purchase
    ↓
Goods Received
    ↓
Stock increases
```

The User Manual describes recording vendor, purchase reference, branch, store, quantity and unit cost. 

---

# 18. Then Go-Live

Once everything is ready:

```text
Business
     ✓

Branch
     ✓

Certificate
     ✓

EIRMS
     ✓

Users
     ✓

Products
     ✓

Inventory
     ✓

System Test
     ✓
```

Then:

# Activate Merchant

Status:

```text
SETUP
  ↓
ACTIVE
```

---

# 19. NOW THE BUSINESS CAN SELL

Customer enters store.

```text
Customer
   ↓
Cashier
   ↓
New Sale
   ↓
Select / Scan Products
   ↓
Cart
   ↓
Buyer Type
   ↓
Payment
   ↓
Issue Invoice
```

The User Manual explicitly defines three buyer categories:

* B2C / Walk-in
* B2B / Business
* B2G / Government. 

---

# 20. Stock is checked BEFORE EIRMS

This is a subtle but important technical detail.

The SDD specifies:

```text
Sale
 ↓
Check stock
 ↓
Prepare invoice
 ↓
Call EIRMS
 ↓
EIRMS acknowledgement
 ↓
Decrease stock
```

Not:

```text
Decrease stock
 ↓
Call EIRMS
```

because if EIRMS rejects the invoice, you could incorrectly remove stock.

The SDD explicitly defines this ordering rule. 

---

# 21. Invoice goes to EIRMS

The platform:

```text
Zemen ePOS
      ↓
Validate
      ↓
Save
      ↓
BullMQ
      ↓
Signed EIRMS request
      ↓
MoR / EIRMS
```

The platform overview describes the same flow: checkout → validation/persistence → BullMQ → MoR/EIRMS → IRN. 

---

# 22. EIRMS accepts the invoice

Then:

```text
EIRMS
   ↓
Validate
   ↓
Accept
   ↓
IRN
   ↓
Receipt / fiscal document
```

The User Manual defines **Accepted** as EIRMS having received and validated the invoice or receipt. 

---

# 23. Payment can happen separately from invoice registration

This is another important detail.

An invoice can be:

```text
Accepted
+
Unpaid
```

The User Manual explicitly distinguishes invoice status from payment status. 

For example:

```text
Invoice:
ETB 100,000

Paid:
ETB 40,000

Remaining:
ETB 60,000
```

A partial payment can be recorded and the invoice remains open. 

---

# 24. NOW: How does the SaaS make money?

Here we have to separate **what your documents say** from **what you need to decide**.

## The documents DO NOT define:

* Monthly subscription
* Annual subscription
* Per-invoice fee
* Transaction percentage
* Free tier
* Trial period
* Payment gateway
* Automatic billing
* Merchant subscription status
* Invoice limits by plan

I searched specifically for subscription/payment/billing requirements and they are not defined in the SDD. The documented "payment" functionality is **business invoice/receipt settlement**, not SaaS subscription billing.  

So **do not tell the product owner that the current PDF already specifies SaaS billing. It doesn't.**

---

# 25. How I would design the SaaS business model

For Zemen ePOS, I would **not start with a percentage of every sale** unless there is a strong business reason.

A cleaner model is:

## Subscription + usage/branch pricing

For example:

```text
STARTER
ETB X / month

1 Branch
5 Users
X invoices/month
Basic Reports
```

```text
BUSINESS
ETB X / month

5 Branches
25 Users
Higher invoice limit
Inventory
Reports
Support
```

```text
ENTERPRISE
Custom

Unlimited / negotiated
Branches
Users
Higher volume
Dedicated support
Custom integration
```

Those prices are examples, **not prices from your documents**.

---

# 26. How the merchant actually pays

The SaaS flow should be:

```text
Merchant
   ↓
Choose Plan
   ↓
Billing Period
   ↓
Payment
   ↓
Payment Provider
   ↓
Payment Confirmed
   ↓
Subscription Activated
```

For example:

```text
Business Plan
ETB X/month

Payment:
[ Pay Now ]

       ↓

Payment Gateway

       ↓

Success

       ↓

Subscription:
ACTIVE
```

---

# 27. Should the merchant pay before admin approval?

I would **not charge the merchant before they are approved**.

That creates unnecessary friction.

Better:

```text
SIGN UP
   ↓
APPLICATION
   ↓
ADMIN APPROVAL
   ↓
SETUP
   ↓
SELECT PLAN
   ↓
PAY
   ↓
ACTIVATE
```

Or, if you offer a free setup/trial:

```text
SIGN UP
   ↓
APPROVAL
   ↓
SETUP
   ↓
TRIAL
   ↓
PAYMENT REQUIRED
   ↓
SUBSCRIPTION ACTIVE
```

This is a **product recommendation**, not a requirement stated in the PDFs.

---

# 28. What happens if payment fails?

You need a subscription state machine.

```text
TRIAL
   ↓
ACTIVE
   ↓
PAYMENT DUE
   ↓
PAST DUE
   ↓
GRACE PERIOD
   ↓
SUSPENDED
```

But don't immediately delete the merchant.

For example:

```text
Subscription:
Past Due

Business Data:
SAFE

Invoices:
READ ONLY

New Sales:
BLOCKED

Reports:
AVAILABLE
```

Then after payment:

```text
PAID
 ↓
ACTIVE
```

This is much safer than destroying access immediately.

---

# 29. Very important: subscription suspension ≠ merchant suspension

Don't mix these two.

### Merchant status

```text
Pending
Approved
Active
Suspended
Rejected
```

### Subscription status

```text
Trial
Active
Past Due
Grace Period
Cancelled
Expired
```

These are different concepts.

A merchant can be:

```text
Merchant:
ACTIVE

Subscription:
PAST_DUE
```

Or:

```text
Merchant:
SUSPENDED

Subscription:
ACTIVE
```

For example, admin may suspend a merchant for compliance reasons while the subscription is fully paid.

---

# 30. The complete end-to-end SaaS flow

This is the flow I would actually implement.

```text
                  ┌───────────────────┐
                  │   MERCHANT OWNER  │
                  └─────────┬─────────┘
                            │
                            ▼
                    Create Account
                            │
                            ▼
                  Enter Business Details
                            │
                            ▼
                    Add First Branch
                            │
                            ▼
                  Submit Application
                            │
                            ▼
                     ┌─────────────┐
                     │ PLATFORM    │
                     │ ADMIN       │
                     └──────┬──────┘
                            │
                    Review Application
                       /          \
                      /            \
                 Reject          Approve
                   │                │
                   ▼                ▼
                End /          Merchant Approved
                Resubmit             │
                                     ▼
                              Setup Workspace
                                     │
                                     ▼
                              INSA Certificate
                                     │
                                     ▼
                              EIRMS Configuration
                                     │
                                     ▼
                              Create Users
                                     │
                                     ▼
                            Products / Inventory
                                     │
                                     ▼
                              System Verification
                                     │
                                     ▼
                                  Go Live
                                     │
                                     ▼
                              Choose SaaS Plan
                                     │
                                     ▼
                                  Payment
                                     │
                                     ▼
                            Subscription ACTIVE
                                     │
                                     ▼
                              BUSINESS OPERATES
                                     │
                  ┌──────────────────┼──────────────────┐
                  ▼                  ▼                  ▼
               Sales             Inventory          Reports
                  │
                  ▼
               Invoice
                  │
                  ▼
               EIRMS
                  │
                  ▼
            IRN / Acceptance
                  │
                  ▼
              Receipt
```

---

# 31. The Admin-created merchant flow

You also asked whether the admin should be able to create merchants.

**Yes. I would support it.**

But make it a different flow:

```text
Platform Admin
      ↓
Add Merchant
      ↓
Enter Business Information
      ↓
Create Merchant
      ↓
Invite Owner
      ↓
Owner Receives Invitation
      ↓
Set Password
      ↓
Complete Profile
      ↓
Admin Verification
      ↓
Approved
      ↓
Setup
```

This is useful for enterprise onboarding.

For example, Zemen ePOS sales staff signs a contract with:

**ABC Supermarket PLC**

The sales staff shouldn't tell the customer:

> "Go register yourself online."

They can create the organization and invite the designated owner.

---

# 32. What the owner should see after registration

Don't just show:

> "Waiting for approval."

Build a proper onboarding tracker:

```text
APPLICATION STATUS

✓ Account Created

✓ Business Information

✓ Branch Information

● Admin Review

○ Certificate Setup

○ EIRMS Configuration

○ User Setup

○ Inventory Setup

○ Go Live
```

If rejected:

```text
Application Requires Changes

Reason:
TIN information needs correction.

[Edit Application]
```

This makes the system feel like a real SaaS product rather than an ordinary CRUD application.

---

# 33. What happens when the owner has multiple branches?

The merchant doesn't create another merchant.

They create another branch:

```text
ABC Trading
│
├── Addis Branch
│     ├── Certificate
│     ├── EIRMS credentials
│     ├── POS sequence
│     └── Stores
│
├── Adama Branch
│     ├── Certificate
│     ├── EIRMS credentials
│     ├── POS sequence
│     └── Stores
│
└── Bahir Dar Branch
      ├── Certificate
      ├── EIRMS credentials
      ├── POS sequence
      └── Stores
```

The SDD explicitly defines the branch as the fiscal unit and says branches don't share stock or document sequences. 

---

# 34. One thing I would change from your current concept

Don't make the flow:

```text
Owner Signup
↓
Immediately Active
↓
Start Selling
```

That's too weak for this system.

You're dealing with **fiscal compliance**, certificates, EIRMS credentials, merchant identity and branch fiscal identity.

The better flow is:

```text
REGISTER
   ↓
VERIFY
   ↓
APPROVE
   ↓
CONFIGURE
   ↓
CERTIFICATE
   ↓
EIRMS
   ↓
TEST
   ↓
SUBSCRIPTION
   ↓
ACTIVATE
   ↓
SELL
```

That is much closer to the architecture actually described in your documents.

---

# 35. And the biggest missing piece in your documentation

Your PDFs are reasonably strong on the **technical system**, but they still do not fully specify the **commercial SaaS layer**.

You need a separate section/document for:

### SaaS Business Requirements

It should define:

1. **Who can register a merchant**
2. **Who approves a merchant**
3. **Merchant approval criteria**
4. **Required business information**
5. **Required legal documents**
6. **Owner verification**
7. **Merchant status lifecycle**
8. **Subscription plans**
9. **Pricing**
10. **Trial period**
11. **Payment provider**
12. **Billing frequency**
13. **Invoice generation for Zemen ePOS subscription**
14. **Payment failure handling**
15. **Grace period**
16. **Suspension rules**
17. **Cancellation**
18. **Refund policy**
19. **Plan upgrades**
20. **Plan downgrades**
21. **Branch-based pricing**
22. **User-based pricing**
23. **Invoice-volume pricing**
24. **Usage limits**
25. **Enterprise contracts**

Those are **not adequately defined in the current technical PDFs**.

And I would not bury them inside the technical SDD. Make them a separate **SaaS Product Requirements / Business Requirements document**.

The technical documents already give you the foundation: multi-tenancy, merchant lifecycle/approval, branch provisioning, INSA certificate workflow, EIRMS integration, inventory, POS, receipts and audit. 

What you're missing now is the **commercial lifecycle around that technical system**. That's the part you should define next.
