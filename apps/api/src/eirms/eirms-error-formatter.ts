/**
 * Turns EIRMS error bodies (any of the formats MOR returns) into a flat list
 * of plain-English messages suitable for display to non-technical users.
 *
 * Recognised body shapes:
 *   - HTTP-error envelope (4xx/406 from MOR), unwrapped into its inner body:
 *       { statusCode, message, body: [...] }
 *   - JSON-schema violations (array of):
 *       { type, code, message, instanceLocation, messageKey, arguments }
 *   - Invoice-register rule violations (array of):
 *       { portion, errorMessage[] }
 *   - Receipt-sales failures:
 *       { status, unknownIrn[], dataMissMuch[], ruleErrorDto[] }
 *   - Anything else → empty list (caller should fall back to a generic line).
 */
export function formatEirmsErrors(body: unknown): string[] {
  const out: string[] = [];
  if (!body) return out;

  if (Array.isArray(body)) {
    collectFromArray(body, out);
    return uniq(out);
  }

  if (typeof body !== 'object') return out;
  const b = body as Record<string, unknown>;

  // MOR's HTTP-error responses wrap the detail in an envelope
  // { statusCode, message, body: [...] }. Recurse into the inner array so we
  // surface the per-field detail instead of just the generic top-level message.
  if (Array.isArray(b.body)) collectFromArray(b.body, out);

  if (Array.isArray(b.unknownIrn) && b.unknownIrn.length > 0) {
    out.push(
      b.unknownIrn.length === 1
        ? "MOR doesn't recognise that invoice."
        : `MOR doesn't recognise ${b.unknownIrn.length} of the invoices.`,
    );
  }

  if (Array.isArray(b.dataMissMuch)) {
    for (const entry of b.dataMissMuch as Array<{
      tag?: string;
      errorMessage?: string[];
    }>) {
      const messages = entry?.errorMessage ?? [];
      for (const raw of messages) out.push(humanise(raw));
    }
  }

  if (Array.isArray(b.ruleErrorDto)) {
    for (const entry of b.ruleErrorDto) collectFromPortion(entry, out);
  }

  // Some endpoints surface a flat top-level message (e.g. cancel "Invoice is
  // cancelled"). Treat the message field as a fallback bullet.
  if (out.length === 0 && typeof b.message === 'string') {
    out.push(humanise(b.message));
  }

  return uniq(out);
}

function collectFromArray(arr: unknown[], out: string[]) {
  const schema = arr.filter(isSchemaErrorEntry);
  if (schema.length > 0) collectSchemaErrors(schema, out);
  for (const entry of arr) {
    if (!isSchemaErrorEntry(entry)) collectFromPortion(entry, out);
  }
}

function collectFromPortion(entry: unknown, out: string[]) {
  if (!entry || typeof entry !== 'object') return;
  const e = entry as { errorMessage?: unknown };
  const msgs = Array.isArray(e.errorMessage)
    ? (e.errorMessage as string[])
    : [];
  for (const raw of msgs) out.push(humanise(raw));
}

interface SchemaErrorEntry {
  type?: string;
  message?: string;
  instanceLocation?: string;
  messageKey?: string;
  arguments?: unknown[];
}

function isSchemaErrorEntry(e: unknown): e is SchemaErrorEntry {
  return (
    !!e &&
    typeof e === 'object' &&
    typeof (e as SchemaErrorEntry).instanceLocation === 'string'
  );
}

/**
 * MOR JSON-schema violations arrive as one entry per broken rule, e.g.
 * "$.BuyerDetails.Tin: does not match the regex pattern ^([0-9]{10,20})$".
 * Translate each into "<friendly field> <plain requirement>." and group by
 * field so a field's pattern rule subsumes its redundant length rules.
 */
function collectSchemaErrors(entries: SchemaErrorEntry[], out: string[]) {
  const byField = new Map<string, SchemaErrorEntry[]>();
  for (const e of entries) {
    const key = e.instanceLocation ?? '';
    const list = byField.get(key);
    if (list) list.push(e);
    else byField.set(key, [e]);
  }
  for (const [loc, group] of byField) {
    const label = fieldLabel(loc);
    const pattern = group.find((e) => constraintKey(e) === 'pattern');
    if (pattern) {
      out.push(
        `${label} ${describePattern(String(pattern.arguments?.[0] ?? ''))}.`,
      );
      continue;
    }
    for (const e of group) out.push(`${label} ${describeConstraint(e)}.`);
  }
}

function constraintKey(e: SchemaErrorEntry): string {
  return e.messageKey ?? e.type ?? '';
}

function describeConstraint(e: SchemaErrorEntry): string {
  const arg = e.arguments?.[0];
  switch (constraintKey(e)) {
    case 'minLength':
      return `must be at least ${arg} characters`;
    case 'maxLength':
      return `must be at most ${arg} characters`;
    case 'minimum':
      return `must be at least ${arg}`;
    case 'maximum':
      return `must be at most ${arg}`;
    case 'required':
      return 'is required';
    case 'enum':
      return `must be one of: ${(e.arguments ?? []).join(', ')}`;
    case 'type':
      return `must be a valid ${arg ?? 'value'}`;
    default: {
      const rest = stripPath(e.message ?? '');
      return rest
        ? rest.replace(
            /does not match the regex pattern.*/i,
            'is not in the expected format',
          )
        : 'is invalid';
    }
  }
}

/** Turn a digit regex like ^([0-9]{10,20})$ into "must be 10–20 digits". */
function describePattern(pattern: string): string {
  let m = pattern.match(/\[0-9\]\{(\d+),(\d+)\}/);
  if (m) return `must be ${m[1]}–${m[2]} digits`;
  m = pattern.match(/\[0-9\]\{(\d+)\}/);
  if (m) return `must be exactly ${m[1]} digits`;
  return 'is not in the expected format';
}

const SECTION_LABELS: Record<string, string> = {
  BuyerDetails: 'Buyer',
  SellerDetails: 'Seller',
  DocumentDetails: 'Document',
  PaymentDetails: 'Payment',
  SourceSystem: 'Source system',
  ValueDetails: 'Invoice',
  ItemList: 'Item',
};

const LEAF_LABELS: Record<string, string> = {
  Tin: 'TIN',
  LegalName: 'legal name',
  VatNumber: 'VAT number',
  Email: 'email',
  Phone: 'phone',
  UnitPrice: 'unit price',
  ItemCode: 'item code',
  ProductDescription: 'description',
  Quantity: 'quantity',
  TaxCode: 'tax code',
  Date: 'date',
  DocumentNumber: 'document number',
  Type: 'type',
  TotalValue: 'total',
  TaxValue: 'tax',
  InvoiceCurrency: 'currency',
  CashierName: 'cashier name',
  SalesPersonName: 'salesperson name',
  IdNumber: 'ID number',
  IdType: 'ID type',
  HouseNumber: 'house number',
};

/** "$.BuyerDetails.Tin" → "Buyer TIN"; "$.ItemList[0].UnitPrice" → "Item unit price". */
function fieldLabel(loc: string): string {
  const segments = loc
    .replace(/^\$\.?/, '')
    .split('.')
    .filter(Boolean);
  if (segments.length === 0) return 'A field';
  const sectionRaw = segments[0].replace(/\[\d+\]/g, '');
  const leafRaw = segments[segments.length - 1].replace(/\[\d+\]/g, '');
  const leaf = LEAF_LABELS[leafRaw] ?? camelToWords(leafRaw);
  const section = segments.length > 1 ? SECTION_LABELS[sectionRaw] : undefined;
  return section ? `${section} ${leaf}` : capitalise(leaf);
}

function camelToWords(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .trim();
}

function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function stripPath(msg: string): string {
  return msg.replace(/^\$\.[^:]*:\s*/, '').trim();
}

type Rewriter = string | ((m: RegExpMatchArray) => string);

// Map raw EIRMS phrases to user-friendly equivalents. First match wins.
const REWRITES: Array<[RegExp, Rewriter]> = [
  [
    /collected amount doesn'?t match with sum of total invoice/i,
    "Collected amount doesn't match the invoice total.",
  ],
  [
    /partial receipt generated for the invoice/i,
    'This invoice already has a partial payment recorded.',
  ],
  [
    /currency should be ([\w\s,]+)/i,
    (m) => `Receipt currency must be one of: ${m[1].trim()}.`,
  ],
  [
    /receipt currency is not found\.?\s*([A-Z]{2,5})?/i,
    (m) =>
      m[1]
        ? `Currency "${m[1]}" isn't recognised by MOR.`
        : "That currency isn't recognised by MOR.",
  ],
  [
    /invoice total amount mismatch/i,
    "Invoice total doesn't match what MOR has on file.",
  ],
  [
    /currency doesn'?t match/i,
    'Receipt currency must match the invoice currency.',
  ],
  [
    /document number is not in correct sequence expected\s*:\s*(\d+)/i,
    (m) => `Next document number should be ${m[1]}.`,
  ],
  [
    /invoice counter is not correct expected\s*:\s*(\d+)/i,
    (m) => `Next invoice counter should be ${m[1]}.`,
  ],
  [/invoice is cancelled/i, 'This invoice has already been cancelled.'],
  [/must be the constant value '([^']+)'/i, (m) => `Value must be "${m[1]}".`],
];

function humanise(raw: string): string {
  let s = String(raw)
    .trim()
    // Collapse internal whitespace.
    .replace(/\s+/g, ' ')
    // Strip trailing "false" remnants ("...amount. false").
    .replace(/\.?\s*false\s*$/i, '')
    // Strip leading "7001: (id) " style codes.
    .replace(/^\d{3,5}:\s*\(\w+\)\s*/i, '');
  for (const [pattern, rewriter] of REWRITES) {
    const m = s.match(pattern);
    if (m) return typeof rewriter === 'string' ? rewriter : rewriter(m);
  }
  if (!/[.!?]$/.test(s)) s = `${s}.`;
  return s;
}

function uniq(arr: string[]): string[] {
  return [...new Set(arr)];
}
