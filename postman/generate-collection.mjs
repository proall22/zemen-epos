import { mkdirSync, writeFileSync } from 'node:fs';

const base = '{{baseUrl}}';
const json = (value) => ({ mode: 'raw', raw: JSON.stringify(value, null, 2), options: { raw: { language: 'json' } } });
const q = (key, value, disabled = true) => ({ key, value, disabled });

const invoiceBody = {
  TransactionType: 'B2C',
  BuyerDetails: { LegalName: 'Walk-in Customer', Phone: '0911000000' },
  DocumentDetails: { Date: '01-08-2026T10:00:00', Type: 'INV' },
  ItemList: [{ LineNumber: 1, ItemCode: 'ITM-001', ProductDescription: 'Demo Phone', NatureOfSupplies: 'Goods', Unit: 'PCS', Quantity: 1, UnitPrice: 10000, PreTaxValue: 10000, Discount: 0, ExciseTaxValue: 0, TaxCode: 'VAT15', TaxAmount: 1500, TotalLineAmount: 11500, inventoryItemId: '{{inventoryItemId}}' }],
  PaymentDetails: { Mode: 'CREDIT', PaymentTerm: 'NET_7' },
  ValueDetails: { Discount: 0, ExciseValue: 0, TaxValue: 1500, IncomeWithholdValue: 0, TransactionWithholdValue: 0, TotalValue: 11500, InvoiceCurrency: 'ETB' },
  SourceSystem: { CashierName: 'Hana', SalesPersonName: 'Hana', InvoiceCounter: 1 },
  branchId: '{{branchId}}',
};

function request(name, method, path, { body, query, publicRoute = false, tests = [], description = '' } = {}) {
  const rawPath = `${base}${path}`;
  const req = {
    method,
    header: body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
    url: { raw: rawPath, host: ['{{baseUrl}}'], path: path.split('/').filter(Boolean), ...(query ? { query } : {}) },
    description,
  };
  if (body) req.body = json(body);
  return {
    name,
    request: req,
    event: tests.length ? [{ listen: 'test', script: { type: 'text/javascript', exec: tests } }] : [],
    protocolProfileBehavior: publicRoute ? { disableBodyPruning: true } : undefined,
  };
}

const capture = (variable, expression = 'json.id') => [
  'pm.test("Request succeeded", () => pm.expect(pm.response.code).to.be.within(200, 299));',
  'const json = pm.response.json();',
  `if (${expression}) pm.collectionVariables.set("${variable}", ${expression});`,
];

const folders = [
  { name: 'Auth', item: [
    request('Login', 'POST', '/auth/login', { body: { email: '{{loginEmail}}', password: '{{loginPassword}}', turnstileToken: '{{turnstileToken}}' }, publicRoute: true, tests: ['pm.test("Login succeeded", () => pm.response.to.have.status(201));', 'const json = pm.response.json();', 'pm.collectionVariables.set("accessToken", json.token);', 'pm.collectionVariables.set("userId", json.user.id);', 'if (json.user.merchantId) pm.collectionVariables.set("merchantId", json.user.merchantId);', 'if (json.user.branchId) pm.collectionVariables.set("branchId", json.user.branchId);'] }),
    request('Refresh', 'POST', '/auth/refresh', { publicRoute: true, tests: ['pm.test("Refresh succeeded", () => pm.expect(pm.response.code).to.be.within(200, 201));', 'pm.collectionVariables.set("accessToken", pm.response.json().token);'] }),
    request('Forgot password', 'POST', '/auth/forgot-password', { body: { email: 'owner@acme.et', turnstileToken: '{{turnstileToken}}' }, publicRoute: true }),
    request('Reset password', 'POST', '/auth/reset-password', { body: { token: '{{passwordResetToken}}', password: 'FreshPassword123!' }, publicRoute: true }),
    request('Logout', 'POST', '/auth/logout', { publicRoute: true }),
    request('Me', 'GET', '/auth/me'),
    request('Update preferences', 'PATCH', '/auth/me/preferences', { body: { language: 'am' } }),
    request('Me context', 'GET', '/auth/me/context'),
  ]},
  { name: 'Users', item: [
    request('List users', 'GET', '/users'),
    request('Create user', 'POST', '/users', { body: { email: 'cashier@acme.et', password: 'CashierPass123!', name: 'Hana Tadesse', role: 'CASHIER', merchantId: '{{merchantId}}', branchIds: ['{{branchId}}'], branchId: '{{branchId}}' }, tests: capture('createdUserId') }),
    request('Update user', 'PATCH', '/users/{{createdUserId}}', { body: { name: 'Hana T.', active: true, branchIds: ['{{branchId}}'], branchId: '{{branchId}}' } }),
    request('Unlock user', 'POST', '/users/{{createdUserId}}/unlock'),
  ]},
  { name: 'Merchants and branches', item: [
    request('List merchants', 'GET', '/merchants'),
    request('Create merchant', 'POST', '/merchants', { body: { legalName: 'Acme Trading PLC', tradeName: 'Acme', tin: '0000123456', email: 'owner@acme.et', phone: '0911000000', city: 'Addis Ababa' }, tests: capture('merchantId') }),
    request('Get merchant', 'GET', '/merchants/{{merchantId}}'),
    request('Update merchant', 'PATCH', '/merchants/{{merchantId}}', { body: { tradeName: 'Acme Ethiopia', defaultLanguage: 'en' } }),
    request('Reject merchant', 'POST', '/merchants/{{merchantId}}/reject', { body: { reason: 'Registration documents could not be verified.' } }),
    request('List branches', 'GET', '/merchants/{{merchantId}}/branches'),
    request('Create branch', 'POST', '/merchants/{{merchantId}}/branches', { body: { name: 'Bole Branch', systemNumber: 'SYS-BOLE-01', city: 'Addis Ababa', country: 'ET', stockPolicy: 'BLOCK_ON_EMPTY', latitude: 9.0054, longitude: 38.7636 }, tests: capture('branchId') }),
    request('Branch stats', 'GET', '/merchants/{{merchantId}}/branches/{{branchId}}/stats'),
    request('Update branch', 'PATCH', '/merchants/{{merchantId}}/branches/{{branchId}}', { body: { tradeName: 'Acme Bole', active: true } }),
  ]},
  { name: 'Inventory', item: [
    request('List inventory', 'GET', '/inventory', { query: [q('includeInactive', 'false', false), q('q', 'phone')] }),
    request('Scan barcode', 'GET', '/inventory/scan/5449000000996'),
    request('Create item', 'POST', '/inventory', { body: { code: 'ITM-001', sku: 'SKU-001', upc: '5449000000996', description: 'Demo Phone', unit: 'PCS', unitPrice: 10000, taxCode: 'VAT15', nature: 'goods', trackStock: true, stockQuantity: 20, lowStockThreshold: 3 }, tests: capture('inventoryItemId') }),
    request('Get item', 'GET', '/inventory/{{inventoryItemId}}'),
    request('Update item', 'PATCH', '/inventory/{{inventoryItemId}}', { body: { description: 'Demo Phone v2' } }),
    request('Supersede item', 'POST', '/inventory/{{inventoryItemId}}/supersede', { body: { code: 'ITM-002', description: 'Demo Phone New Price', unitPrice: 11000, taxCode: 'VAT15', nature: 'goods' } }),
    request('Adjust stock', 'POST', '/inventory/{{inventoryItemId}}/stock-adjust', { body: { delta: 10, reason: 'RESTOCK', note: 'Opening delivery' } }),
    request('Record stock count', 'POST', '/inventory/{{inventoryItemId}}/stock-count', { body: { counted: 25, storeId: '{{storeId}}', note: 'Month-end count' } }),
    request('Stock by store', 'GET', '/inventory/{{inventoryItemId}}/stock'),
    request('Item movements', 'GET', '/inventory/{{inventoryItemId}}/movements'),
    request('Write off', 'POST', '/inventory/{{inventoryItemId}}/write-off', { body: { quantity: 1, reason: 'DAMAGE', note: 'Screen cracked during handling' } }),
  ]},
  { name: 'Invoices', item: [
    request('Create invoice', 'POST', '/invoices', { body: invoiceBody, tests: [...capture('invoiceId'), 'if (json.irn) pm.collectionVariables.set("invoiceIrn", json.irn);'] }),
    request('List invoices', 'GET', '/invoices', { query: [q('from', '2026-08-01'), q('to', '2026-08-31'), q('q', ''), q('scope', 'branch'), q('status', 'UNPAID'), q('cursor', ''), q('limit', '50', false)] }),
    request('Next invoice sequence', 'GET', '/invoices/next-sequence'),
    request('Create draft', 'POST', '/invoices/draft', { body: invoiceBody, tests: capture('invoiceDraftId') }),
    request('List drafts', 'GET', '/invoices/drafts'),
    request('Sync draft', 'POST', '/invoices/drafts/{{invoiceDraftId}}/sync'),
    request('Delete draft', 'DELETE', '/invoices/drafts/{{invoiceDraftId}}'),
    request('Invoice QR PNG', 'GET', '/invoices/{{invoiceId}}/qr.png', { publicRoute: true }),
    request('Public invoice', 'GET', '/invoices/{{invoiceId}}/public', { query: [q('t', '{{publicToken}}', false)], publicRoute: true }),
    request('Get by IRN', 'GET', '/invoices/by-irn/{{invoiceIrn}}'),
    request('Lookup external', 'POST', '/invoices/lookup-external', { body: { irn: '{{externalInvoiceIrn}}' } }),
    request('Import from IRN', 'POST', '/invoices/import-from-irn', { body: { irn: '{{externalInvoiceIrn}}' } }),
    request('Get invoice', 'GET', '/invoices/{{invoiceId}}'),
    request('Invoice chain', 'GET', '/invoices/{{invoiceId}}/chain'),
    request('Cancel invoice', 'POST', '/invoices/{{invoiceId}}/cancel', { body: { reasonCode: '1', remark: 'Duplicate invoice' } }),
    request('Verify invoice', 'POST', '/invoices/{{invoiceId}}/verify'),
  ]},
  { name: 'Receipts', item: [
    request('Create sales receipt', 'POST', '/receipts', { body: { reason: 'Payment received', collectedAmount: 11500, receiptCurrency: 'ETB', invoices: [{ invoiceId: '{{invoiceId}}', paymentCoverage: 'FULL', invoicePaidAmount: 11500, discountAmount: 0, remainingAmount: 0, totalAmount: 11500 }], transactionDetails: { paymentMode: 'CASH', modeOfPayment: 'CASH', collectorName: 'Hana' } }, tests: capture('receiptId') }),
    request('List receipts', 'GET', '/receipts', { query: [q('from', '2026-08-01'), q('to', '2026-08-31'), q('q', ''), q('scope', 'branch'), q('kind', 'SALES'), q('cursor', ''), q('limit', '50', false)] }),
    request('Withholding register', 'GET', '/receipts/withholding-register', { query: [q('from', '2026-08-01', false), q('to', '2026-08-31'), q('q', ''), q('cursor', ''), q('limit', '50', false)] }),
    request('Next receipt sequence', 'GET', '/receipts/next-sequence'),
    request('Create withholding receipt', 'POST', '/receipts/withhold', { body: { reason: '3% transaction withholding', invoiceDetail: { invoiceIrn: '{{externalInvoiceIrn}}', currency: 'ETB' }, withholdDetail: { type: 'TWTH', rate: 3, preTaxAmount: 40000, withholdingAmount: 1200 }, supplier: { legalName: 'Supplier PLC', tin: '0000999999', phone: '0911223344' } } }),
    request('Next withholding sequence', 'GET', '/receipts/withhold/next-sequence'),
    request('Receipt QR PNG', 'GET', '/receipts/{{receiptId}}/qr.png', { publicRoute: true }),
    request('Public receipt', 'GET', '/receipts/{{receiptId}}/public', { query: [q('t', '{{publicToken}}', false)], publicRoute: true }),
    request('Get receipt', 'GET', '/receipts/{{receiptId}}'),
    request('Verify receipt', 'POST', '/receipts/{{receiptId}}/verify'),
  ]},
];

const collection = {
  info: { name: 'EIRMS Zemen-ePos API (analyzed controllers)', description: 'All 58 operations from auth, users, merchants/branches, inventory, invoices, and receipts. Public requests are identified by path in the collection pre-request script.', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] },
  variable: ['accessToken','merchantId','branchId','createdUserId','inventoryItemId','storeId','invoiceId','invoiceIrn','invoiceDraftId','receiptId'].map((key) => ({ key, value: '' })),
  event: [{ listen: 'prerequest', script: { type: 'text/javascript', exec: [
    'const path = pm.request.url.getPath();',
    'const publicPaths = ["/auth/login", "/auth/refresh", "/auth/forgot-password", "/auth/reset-password", "/auth/logout"];',
    'const isPublicDocument = /^\\/(invoices|receipts)\\/[^/]+\\/(qr\\.png|public)$/.test(path);',
    'if (publicPaths.includes(path) || isPublicDocument) pm.request.auth = { type: "noauth" };',
    'const branchId = pm.variables.replaceIn("{{branchId}}");',
    'if (branchId && branchId !== "{{branchId}}" && !pm.request.headers.has("X-Branch-Id")) pm.request.headers.add({ key: "X-Branch-Id", value: branchId });',
    'const consentMerchantId = pm.environment.get("consentMerchantId");',
    'if (consentMerchantId) pm.request.headers.upsert({ key: "X-Consent-Merchant-Id", value: consentMerchantId });',
  ] } }],
  item: folders,
};

const environment = {
  id: 'a85f79e9-e89a-4dbe-aa82-eirms-epay-local',
  name: 'EIRMS Zemen-ePos Local',
  values: [
    ['baseUrl', 'http://localhost:4899', true],
    ['loginEmail', 'admin@example.com', true],
    ['loginPassword', 'ChangeMe123!', true],
    ['turnstileToken', '', true],
    ['passwordResetToken', '', true],
    ['publicToken', '', true],
    ['externalInvoiceIrn', '', true],
    ['consentMerchantId', '', true],
  ].map(([key, value, enabled]) => ({ key, value, enabled, type: key.toLowerCase().includes('password') || key.toLowerCase().includes('token') ? 'secret' : 'default' })),
  _postman_variable_scope: 'environment',
  _postman_exported_at: new Date().toISOString(),
  _postman_exported_using: 'Codex repository analysis',
};

mkdirSync(new URL('.', import.meta.url), { recursive: true });
writeFileSync(new URL('./EIRMS-Zemen-ePos.postman_collection.json', import.meta.url), JSON.stringify(collection, null, 2) + '\n');
writeFileSync(new URL('./EIRMS-Zemen-ePos.local.postman_environment.json', import.meta.url), JSON.stringify(environment, null, 2) + '\n');
