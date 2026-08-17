# Zemen-ePOS inventory, stores, vendors, purchases and POS workflow

## The basic structure

The system organizes physical inventory like this:

```text
Merchant
└── Branch
    └── Store
        └── Stock quantity
```

Example:

```text
Merchant: Zemen Market
├── Main Branch
│   ├── Main / Sales Floor
│   └── Back Room
└── Bole Branch
    ├── Main / Sales Floor
    └── Cold Storage
```

An inventory item, vendor, purchase, branch and store each answer a different question:

| Record | Question it answers |
|---|---|
| Inventory item | What product do we buy or sell? |
| Vendor/Supplier | Who supplied the product? |
| Branch | At which business location did it happen? |
| Store | Where is the physical stock kept inside that branch? |
| Purchase | How did stock enter the business? |
| Transfer | How did stock move between stores? |
| Sale | How did stock leave the business? |

## Inventory item: what the business sells

An inventory item defines the product itself:

- description or product name;
- item code or SKU;
- UPC/barcode;
- unit, such as piece, kilogram or litre;
- selling price;
- tax code and excise settings;
- whether stock is tracked;
- catalogue and status information.

Example:

```text
Description: Sugar 1 kg
Code: SUGAR-1KG
Unit: PCS
Selling price: 120 ETB
```

Creating the item tells the system that the merchant sells Sugar 1 kg. It does not mean every branch currently has Sugar in stock. Quantities are stored separately for each store.

The same catalogue item can therefore have different quantities in different branches:

```text
Sugar 1 kg
├── Main Branch / Main Store: 100
└── Bole Branch / Main Store: 40
```

## Vendor and supplier: who provides the goods

In this system, **Vendor and Supplier mean the same thing**. There is not a separate supplier record.

A vendor contains information about the person or company from which the merchant purchases goods:

```text
Vendor: ABC Wholesale
Contact: Abebe Kebede
Phone: 0911...
Email: sales@abc.example
TIN: ...
```

Creating a vendor does not create products or add stock. It only creates the supplier identity that can be attached to a purchase.

The vendor is useful for:

- knowing where inventory came from;
- checking which supplier invoice or delivery note introduced stock;
- reviewing purchase history by supplier;
- tracking supplier contact details;
- comparing procurement history and costs;
- investigating damaged, incorrect or recalled deliveries;
- preserving an audit trail.

A vendor is optional when recording a cash or one-time purchase, but regular suppliers should be registered.

## Branch: the business location

A branch represents a shop, outlet, pharmacy, supermarket location or other registered establishment. Users, EIRMS credentials, INSA certificates, invoice sequences and operational data are branch-scoped.

Examples:

```text
Main Branch
Bole Branch
Piassa Branch
```

Each branch must have at least one active store before stock can be received or sold.

## Store: where physical stock is kept

A store is a named stock location inside one branch. It does not necessarily mean a separate retail shop.

Examples:

- front shelf;
- sales floor;
- back room;
- main warehouse;
- receiving area;
- cold storage;
- damaged-goods area.

The system needs stores because saying “Bole Branch has 100 units” may not be enough. Some units might be available for sale, while others remain in a warehouse or cold room.

Example:

```text
Bole Branch
├── Main Sales Floor: Milk = 20
└── Cold Storage: Milk = 80
```

The total branch stock is 100, but only the sales-floor quantity is directly available to the POS.

## Understanding the Add Store fields

An Add Store form may show values such as:

```text
Name: Cold Storage
Code: COLD
Branch: Main
Sales floor: enabled or disabled
```

### Store name

The name is the human-readable location displayed to users.

Examples:

```text
Main
Cold Storage
Back Room
Warehouse
```

### Store code

The code is a short identifier used to distinguish the store in records and system operations.

Examples:

```text
MAIN
COLD
BACK
WH01
```

For example, `Cold Storage` is the name and `COLD` is its code.

The code should be unique within its applicable scope and should remain stable even if the display name is later changed.

### Branch selection

The branch field decides which branch owns the store.

If `Main` is selected, Cold Storage belongs to Main Branch:

```text
Main Branch
├── Main Store
└── Cold Storage
```

It will not be selectable as a receiving store for Bole Branch because stock locations cannot cross branch ownership.

### Default store

The default store is the store the system prefers when an operation requires a store but the user has not explicitly selected one.

For a small branch, the default store is normally also the sales-floor store:

```text
Main Store
Default: Yes
Sales floor: Yes
```

### Sales-floor store

The sales-floor store is the stock location used by the normal POS selling workflow.

The message:

> The POS sale path decrements from this store.

means:

> When a cashier successfully sells an item, the system subtracts the sold quantity from this store's stock balance.

Here, **decrement** simply means **reduce or subtract**.

Example before a sale:

```text
Main Branch / Main Sales Floor / Sugar = 50
```

The cashier sells 3 units of Sugar:

```text
50 - 3 = 47
```

After the invoice is accepted:

```text
Main Branch / Main Sales Floor / Sugar = 47
```

The system also writes a SALE stock-movement record so the reduction can be audited.

The phrase **POS sale path** means the sequence of actions used to complete a sale:

```text
Cashier opens POS
→ selects a product
→ adds quantity to the cart
→ system reserves available stock
→ cashier submits the sale
→ EIRMS accepts the invoice
→ sale is persisted
→ sold quantity is subtracted from the sales-floor store
→ SALE movement is recorded
```

The stock should be permanently reduced only when the sale is completed successfully. A cart reservation temporarily holds stock so two cashiers do not promise the same units at the same time.

## Why only one sales-floor store should exist per branch

The POS must have one unambiguous answer to:

> Which store should lose stock when the cashier sells something?

If two stores were both sales floors, the system would not know whether to subtract from Main, Cold Storage or both. Therefore only one store per branch should be flagged as the sales floor.

The message:

> Turning it on here demotes the current holder in the same transaction.

means that selecting a new sales-floor store automatically removes the flag from the old one in the same database operation.

Before changing the flag:

```text
Main Store
Sales floor: Yes

Cold Storage
Sales floor: No
```

If the user turns on Sales floor for Cold Storage, the result becomes:

```text
Main Store
Sales floor: No

Cold Storage
Sales floor: Yes
```

**Demotes** means the old store loses its sales-floor status. It does not delete the store or its stock.

**In the same transaction** means the database performs both changes as one operation. The system should not temporarily leave two sales floors or no sales floor if part of the update fails.

Normally, Cold Storage should not be the sales floor. Stock should instead be transferred from Cold Storage to Main Sales Floor before cashiers sell it.

## Why the first branch already has a Main store

During merchant self-registration, the system creates:

```text
Merchant
└── First branch
    └── Main store
        ├── Default: Yes
        └── Sales floor: Yes
```

This lets the first branch receive stock and sell without requiring another setup step.

The backend also attempts to create a default Main store whenever a new branch is created. If an older or manually migrated second branch says that no store exists, possible reasons include:

- the branch existed before automatic default-store creation was added;
- its store was disabled or removed;
- the selected store belongs to another branch;
- the branch is pending or inactive;
- the user does not have access to that branch;
- store loading failed.

For a branch without a store:

1. Open **Inventory → Stores**.
2. Select the affected branch.
3. Add a store named `Main` with code `MAIN`.
4. Mark it active.
5. Mark it as the default and sales-floor store.
6. Return to Purchases.

## Purchase: bringing stock into a store

A purchase is a goods-received transaction. It connects:

```text
Vendor
→ purchased inventory item
→ branch
→ receiving store
→ quantity and unit cost
```

Example:

```text
Vendor: ABC Wholesale
Branch: Bole Branch
Receiving store: Main
Item: Sugar 1 kg
Quantity: 100
Unit cost: 90 ETB
Reference: Supplier invoice ABC-2045
```

When recorded, the system:

- creates a purchase record;
- links it to the selected vendor;
- increases Sugar stock by 100 in the selected receiving store;
- writes a RESTOCK stock-movement record;
- stores the supplier invoice/reference;
- updates the item's running average cost.

The purchase item must already exist under Inventory. A vendor does not create the product.

## Correct setup and operating flow

### 1. Register and approve the merchant

```text
Merchant self-registers or Super Admin creates merchant
→ Super Admin reviews and approves
```

### 2. Configure branches

```text
Create branch
→ approve branch when required
→ confirm it has an active Main store
→ choose its default and sales-floor store
```

### 3. Create the inventory catalogue

Under Inventory, create the products the merchant buys or sells:

```text
Sugar 1 kg
Cooking Oil 1 litre
Milk
Soap
```

### 4. Create regular vendors

Under Vendors, create suppliers such as:

```text
ABC Wholesale
XYZ Distributor
```

### 5. Record a purchase

```text
Open Purchases
→ select branch
→ select vendor
→ enter supplier reference
→ select existing inventory item
→ select receiving store
→ enter quantity and unit cost
→ record purchase
```

### 6. Transfer warehouse stock when necessary

If a purchase is received into a non-sales store:

```text
Purchase received into Cold Storage or Warehouse
→ transfer required quantity to Main Sales Floor
→ sales-floor quantity increases
```

### 7. Sell through the POS

```text
Cashier selects branch
→ POS reads the branch's sales-floor stock
→ cashier adds items to cart
→ system reserves stock
→ invoice is registered
→ stock is subtracted from the sales-floor store
```

### 8. Handle cancellation

When an eligible completed sale is cancelled, the system records the cancellation and reverses the applicable sale stock movement, returning the quantity to the correct stock location according to the implemented cancellation rules.

## Complete example

Initial setup:

```text
Merchant: Zemen Supermarket

Main Branch
├── Main Store — sales floor
└── Cold Storage — not sales floor

Vendor: Fresh Foods PLC
Item: Milk 1 litre
```

A delivery arrives:

```text
Purchase from Fresh Foods PLC
Milk quantity: 100
Receiving store: Cold Storage
```

Result:

```text
Cold Storage / Milk = 100
Main Sales Floor / Milk = 0
```

Move 20 units to the front:

```text
Transfer 20 Milk
Cold Storage → Main Sales Floor
```

Result:

```text
Cold Storage / Milk = 80
Main Sales Floor / Milk = 20
```

Cashier sells 3 units:

```text
Main Sales Floor / Milk: 20 - 3 = 17
```

Final stock:

```text
Cold Storage / Milk = 80
Main Sales Floor / Milk = 17
Total Main Branch Milk = 97
```

## Simple rule to remember

- **Inventory item**: what is bought or sold.
- **Vendor/Supplier**: who supplied it.
- **Branch**: which business location performed the operation.
- **Store**: where the physical quantity is kept.
- **Sales floor**: the one store from which POS sales subtract stock.
- **Purchase**: goods entering a store.
- **Transfer**: goods moving between stores.
- **Sale**: goods leaving the sales-floor store for a customer.

For a small shop, one `Main` store per branch can be both the default and sales-floor store. Cold Storage, Back Room and Warehouse stores are needed only when the merchant wants separate physical stock locations.
