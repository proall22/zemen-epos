import { csvFilename, inventoryCsv, salesCsv } from './report-csv';
import { formatWindow, reportRows } from './report-email';
import type { InventorySection, ReportPayload, SalesEventRow } from './reports.types';

const EAT = 'Africa/Addis_Ababa';

const EVENT: SalesEventRow = {
  type: 'invoice_generated',
  occurredAt: new Date('2026-07-19T07:30:00.000Z'),
  branchId: 'bA',
  branchName: 'Bole',
  reference: 'IRN-1',
  documentType: 'INV',
  buyerTin: '000111222',
  buyerName: 'Acme PLC',
  preTax: 100,
  tax: 15,
  total: 115,
  currency: 'ETB',
  detail: 'PAID',
};

describe('salesCsv', () => {
  it('carries both local and UTC stamps', () => {
    const out = salesCsv([EVENT], EAT);
    const [, row] = out.trim().split('\n');
    // 07:30Z is 10:30 in Addis.
    expect(row).toContain('2026-07-19 10:30:00');
    expect(row).toContain('2026-07-19T07:30:00.000Z');
  });

  it('formats money to two places and leaves blanks empty', () => {
    const out = salesCsv([{ ...EVENT, preTax: null, tax: null }], EAT);
    const [, row] = out.trim().split('\n');
    expect(row).toContain('115.00');
    expect(row).toContain(',,');
  });

  it('neutralises a formula-injecting buyer name', () => {
    // Buyer names are merchant-controlled and land straight in a spreadsheet.
    const out = salesCsv(
      [{ ...EVENT, buyerName: '=HYPERLINK("http://evil.example")' }],
      EAT,
    );
    expect(out).toContain("'=HYPERLINK");
    expect(out).not.toMatch(/,=HYPERLINK/);
  });

  it('emits one row per event, plus a header', () => {
    const out = salesCsv([EVENT, { ...EVENT, type: 'receipt_created' }], EAT);
    expect(out.trim().split('\n')).toHaveLength(3);
  });
});

describe('inventoryCsv', () => {
  const section: InventorySection = {
    totalMovements: 3,
    stores: [
      {
        storeId: 's1',
        storeName: 'Sales floor',
        branchId: 'bA',
        branchName: 'Bole',
        net: -5,
        in: 10,
        out: 15,
        count: 3,
        byReason: [
          { reason: 'RESTOCK', delta: 10, count: 1 },
          { reason: 'SALE', delta: -15, count: 2 },
        ],
      },
    ],
  };

  it('emits a row per reason plus a store TOTAL', () => {
    const lines = inventoryCsv(section).trim().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[3]).toContain('TOTAL');
  });

  it('splits in and out rather than only reporting net', () => {
    // A store that moved 10 in and 15 out must not read as a single -5.
    const total = inventoryCsv(section).trim().split('\n')[3];
    expect(total).toContain('10.000');
    expect(total).toContain('15.000');
    expect(total).toContain('-5.000');
  });
});

describe('csvFilename', () => {
  it('stamps the local window end', () => {
    expect(
      csvFilename('sales', new Date('2026-07-19T07:30:00.000Z'), EAT),
    ).toBe('sales-20260719-1030.csv');
  });
});

describe('formatWindow', () => {
  it('collapses to one date when the window is inside a local day', () => {
    expect(
      formatWindow(
        {
          start: new Date('2026-07-19T03:00:00.000Z'),
          end: new Date('2026-07-19T09:00:00.000Z'),
        },
        EAT,
      ),
    // ICU has no "EAT" abbreviation for this zone; GMT+3 is unambiguous and
    // never invented, which matters for an external recipient.
    ).toBe('19 Jul 2026, 06:00–12:00 GMT+3');
  });

  it('spells both dates when the window crosses local midnight', () => {
    const out = formatWindow(
      {
        start: new Date('2026-07-19T18:00:00.000Z'),
        end: new Date('2026-07-20T03:00:00.000Z'),
      },
      EAT,
    );
    expect(out).toContain('19 Jul 2026 21:00');
    expect(out).toContain('20 Jul 2026 06:00');
  });

  it('never shows a bare UTC timestamp to a merchant', () => {
    const out = formatWindow(
      {
        start: new Date('2026-07-19T03:00:00.000Z'),
        end: new Date('2026-07-19T09:00:00.000Z'),
      },
      EAT,
    );
    expect(out).not.toContain('Z');
    expect(out).not.toContain('T0');
  });
});

describe('reportRows', () => {
  const payload = (over: Partial<ReportPayload> = {}): ReportPayload => ({
    window: {
      start: new Date('2026-07-19T00:00:00Z'),
      end: new Date('2026-07-19T06:00:00Z'),
    },
    sections: ['SALES'],
    counts: { invoices: 2, cancellations: 0, receipts: 1, movements: 0 },
    empty: false,
    sales: {
      generated: { count: 2, preTax: 200, tax: 30, total: 230 },
      cancelled: { count: 0, total: 0 },
      receipts: { count: 1, collected: 115 },
      withholding: { count: 0, withheld: 0 },
      byBranch: [],
    },
    ...over,
  });

  it('leads with issued invoices and their value', () => {
    const rows = reportRows(payload());
    expect(rows[0]).toEqual({ label: 'Invoices issued', value: '2 · ETB 230.00' });
  });

  it('omits zero-count sections rather than printing noise', () => {
    const labels = reportRows(payload()).map((r) => r.label);
    expect(labels).not.toContain('Invoices cancelled');
    expect(labels).not.toContain('Withholding filed');
  });

  it('includes them once they are non-zero', () => {
    const p = payload();
    p.sales!.cancelled = { count: 1, total: 0 };
    p.sales!.withholding = { count: 2, withheld: 50 };
    const labels = reportRows(p).map((r) => r.label);
    expect(labels).toContain('Invoices cancelled');
    expect(labels).toContain('Withholding filed');
  });

  it('lists each branch when the report spans the merchant', () => {
    const p = payload();
    p.sales!.byBranch = [
      { branchId: 'bA', branchName: 'Bole', count: 2, preTax: 200, tax: 30, total: 230 },
    ];
    expect(reportRows(p)).toContainEqual({
      label: 'Bole',
      value: '2 invoices · ETB 230.00',
    });
  });
});
