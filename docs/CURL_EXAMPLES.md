# cURL examples

Set these once. Replace IDs after create calls.

```bash
BASE_URL=http://localhost:4899
ACCESS_TOKEN='paste-login-token'
MERCHANT_ID='merchant-id'
BRANCH_ID='branch-id'
USER_ID='user-id'
ITEM_ID='inventory-item-id'
INVOICE_ID='invoice-id'
RECEIPT_ID='receipt-id'
```

Login and retain the refresh cookie:

```bash
curl -i -c cookies.txt -H 'Content-Type: application/json' -d '{"email":"admin@example.com","password":"ChangeMe123!"}' "$BASE_URL/auth/login"
curl -i -b cookies.txt -c cookies.txt -X POST "$BASE_URL/auth/refresh"
curl -i -b cookies.txt -X POST "$BASE_URL/auth/logout"
curl -H "Authorization: Bearer $ACCESS_TOKEN" "$BASE_URL/auth/me"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" "$BASE_URL/auth/me/context"
curl -X PATCH -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' -d '{"language":"am"}' "$BASE_URL/auth/me/preferences"
curl -H 'Content-Type: application/json' -d '{"email":"owner@example.com"}' "$BASE_URL/auth/forgot-password"
curl -H 'Content-Type: application/json' -d '{"token":"reset-token-from-email","password":"FreshPassword123!"}' "$BASE_URL/auth/reset-password"
```

Merchant and branch operations:

```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" "$BASE_URL/merchants"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' -d '{"legalName":"Acme Trading PLC","tradeName":"Acme","tin":"0000123456","email":"owner@acme.et","phone":"0911000000","city":"Addis Ababa"}' "$BASE_URL/merchants"
curl -H "Authorization: Bearer $ACCESS_TOKEN" "$BASE_URL/merchants/$MERCHANT_ID"
curl -X PATCH -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' -d '{"tradeName":"Acme Ethiopia","defaultLanguage":"en"}' "$BASE_URL/merchants/$MERCHANT_ID"
curl -X POST -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' -d '{"reason":"Registration documents could not be verified."}' "$BASE_URL/merchants/$MERCHANT_ID/reject"
curl -H "Authorization: Bearer $ACCESS_TOKEN" "$BASE_URL/merchants/$MERCHANT_ID/branches"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' -d '{"name":"Bole Branch","systemNumber":"SYS-BOLE-01","city":"Addis Ababa","country":"ET","stockPolicy":"BLOCK_ON_EMPTY","latitude":9.0054,"longitude":38.7636}' "$BASE_URL/merchants/$MERCHANT_ID/branches"
curl -H "Authorization: Bearer $ACCESS_TOKEN" "$BASE_URL/merchants/$MERCHANT_ID/branches/$BRANCH_ID/stats"
curl -X PATCH -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' -d '{"tradeName":"Acme Bole","active":true}' "$BASE_URL/merchants/$MERCHANT_ID/branches/$BRANCH_ID"
```

User operations:

```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" "$BASE_URL/users"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' -d "{\"email\":\"cashier@acme.et\",\"password\":\"CashierPass123!\",\"name\":\"Hana Tadesse\",\"role\":\"CASHIER\",\"merchantId\":\"$MERCHANT_ID\",\"branchIds\":[\"$BRANCH_ID\"],\"branchId\":\"$BRANCH_ID\"}" "$BASE_URL/users"
curl -X PATCH -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' -d '{"name":"Hana T.","active":true}' "$BASE_URL/users/$USER_ID"
curl -X POST -H "Authorization: Bearer $ACCESS_TOKEN" "$BASE_URL/users/$USER_ID/unlock"
```

Inventory operations:

```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" "$BASE_URL/inventory?q=phone&includeInactive=false"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" "$BASE_URL/inventory/scan/5449000000996"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" -H 'Content-Type: application/json' -d '{"code":"ITM-001","sku":"SKU-001","upc":"5449000000996","description":"Demo Phone","unit":"PCS","unitPrice":10000,"taxCode":"VAT15","nature":"goods","trackStock":true,"stockQuantity":20,"lowStockThreshold":3}' "$BASE_URL/inventory"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" "$BASE_URL/inventory/$ITEM_ID"
curl -X PATCH -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" -H 'Content-Type: application/json' -d '{"description":"Demo Phone v2"}' "$BASE_URL/inventory/$ITEM_ID"
curl -X POST -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" -H 'Content-Type: application/json' -d '{"code":"ITM-002","description":"Demo Phone New Price","unitPrice":11000,"taxCode":"VAT15","nature":"goods"}' "$BASE_URL/inventory/$ITEM_ID/supersede"
curl -X POST -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" -H 'Content-Type: application/json' -d '{"delta":10,"reason":"RESTOCK","note":"Opening delivery"}' "$BASE_URL/inventory/$ITEM_ID/stock-adjust"
curl -X POST -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" -H 'Content-Type: application/json' -d '{"counted":25,"storeId":"store-id","note":"Month-end count"}' "$BASE_URL/inventory/$ITEM_ID/stock-count"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" "$BASE_URL/inventory/$ITEM_ID/stock"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" "$BASE_URL/inventory/$ITEM_ID/movements"
curl -X POST -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" -H 'Content-Type: application/json' -d '{"quantity":1,"reason":"DAMAGE","note":"Screen cracked during handling"}' "$BASE_URL/inventory/$ITEM_ID/write-off"
```

Invoice operations (totals must match the service's arithmetic checks):

```bash
INVOICE_JSON="{\"TransactionType\":\"B2C\",\"BuyerDetails\":{\"LegalName\":\"Walk-in Customer\"},\"DocumentDetails\":{\"Date\":\"01-08-2026T10:00:00\",\"Type\":\"INV\"},\"ItemList\":[{\"LineNumber\":1,\"ItemCode\":\"ITM-001\",\"ProductDescription\":\"Demo Phone\",\"NatureOfSupplies\":\"Goods\",\"Unit\":\"PCS\",\"Quantity\":1,\"UnitPrice\":10000,\"PreTaxValue\":10000,\"Discount\":0,\"ExciseTaxValue\":0,\"TaxCode\":\"VAT15\",\"TaxAmount\":1500,\"TotalLineAmount\":11500,\"inventoryItemId\":\"$ITEM_ID\"}],\"PaymentDetails\":{\"Mode\":\"CREDIT\",\"PaymentTerm\":\"NET_7\"},\"ValueDetails\":{\"Discount\":0,\"ExciseValue\":0,\"TaxValue\":1500,\"IncomeWithholdValue\":0,\"TransactionWithholdValue\":0,\"TotalValue\":11500,\"InvoiceCurrency\":\"ETB\"},\"SourceSystem\":{\"CashierName\":\"Hana\",\"SalesPersonName\":\"Hana\",\"InvoiceCounter\":1},\"branchId\":\"$BRANCH_ID\"}"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" -H 'Content-Type: application/json' -d "$INVOICE_JSON" "$BASE_URL/invoices"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" "$BASE_URL/invoices?from=2026-08-01&status=UNPAID&limit=50"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" "$BASE_URL/invoices/next-sequence"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" -H 'Content-Type: application/json' -d "$INVOICE_JSON" "$BASE_URL/invoices/draft"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" "$BASE_URL/invoices/drafts"
curl -X POST -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" "$BASE_URL/invoices/drafts/draft-id/sync"
curl -X DELETE -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" "$BASE_URL/invoices/drafts/draft-id"
curl "$BASE_URL/invoices/$INVOICE_ID/qr.png" --output invoice-qr.png
curl "$BASE_URL/invoices/$INVOICE_ID/public?t=public-link-token"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" "$BASE_URL/invoices/by-irn/mor-irn"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" -H 'Content-Type: application/json' -d '{"irn":"mor-irn"}' "$BASE_URL/invoices/lookup-external"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" -H 'Content-Type: application/json' -d '{"irn":"mor-irn"}' "$BASE_URL/invoices/import-from-irn"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" "$BASE_URL/invoices/$INVOICE_ID"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" "$BASE_URL/invoices/$INVOICE_ID/chain"
curl -X POST -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" -H 'Content-Type: application/json' -d '{"reasonCode":"1","remark":"Duplicate invoice"}' "$BASE_URL/invoices/$INVOICE_ID/cancel"
curl -X POST -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" "$BASE_URL/invoices/$INVOICE_ID/verify"
```

Receipt operations:

```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" -H 'Content-Type: application/json' -d "{\"reason\":\"Payment received\",\"collectedAmount\":11500,\"receiptCurrency\":\"ETB\",\"invoices\":[{\"invoiceId\":\"$INVOICE_ID\",\"paymentCoverage\":\"FULL\",\"invoicePaidAmount\":11500,\"discountAmount\":0,\"remainingAmount\":0,\"totalAmount\":11500}],\"transactionDetails\":{\"paymentMode\":\"CASH\",\"modeOfPayment\":\"CASH\",\"collectorName\":\"Hana\"}}" "$BASE_URL/receipts"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" "$BASE_URL/receipts?kind=SALES&limit=50"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" "$BASE_URL/receipts/withholding-register?from=2026-08-01"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" "$BASE_URL/receipts/next-sequence"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" -H 'Content-Type: application/json' -d '{"reason":"3% transaction withholding","invoiceDetail":{"invoiceIrn":"supplier-mor-irn","currency":"ETB"},"withholdDetail":{"type":"TWTH","rate":3,"preTaxAmount":40000,"withholdingAmount":1200},"supplier":{"legalName":"Supplier PLC","tin":"0000999999","phone":"0911223344"}}' "$BASE_URL/receipts/withhold"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" "$BASE_URL/receipts/withhold/next-sequence"
curl "$BASE_URL/receipts/$RECEIPT_ID/qr.png" --output receipt-qr.png
curl "$BASE_URL/receipts/$RECEIPT_ID/public?t=public-link-token"
curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" "$BASE_URL/receipts/$RECEIPT_ID"
curl -X POST -H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Branch-Id: $BRANCH_ID" "$BASE_URL/receipts/$RECEIPT_ID/verify"
```
