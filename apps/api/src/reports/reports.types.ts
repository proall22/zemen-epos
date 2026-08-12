import type { ReportSection, StockMovementReason } from '@prisma/client';

/** Half-open [start, end). */
export interface ReportWindow {
  start: Date;
  end: Date;
}

/** branchId absent = merchant-wide. */
export interface ReportScope {
  merchantId: string;
  branchId?: string | null;
}

export interface BranchTotals {
  branchId: string;
  branchName: string;
  count: number;
  preTax: number;
  tax: number;
  total: number;
}

export interface SalesSection {
  generated: { count: number; preTax: number; tax: number; total: number };
  cancelled: { count: number; total: number };
  receipts: { count: number; collected: number };
  withholding: { count: number; withheld: number };
  byBranch: BranchTotals[];
}

export interface StoreMovementRow {
  storeId: string;
  storeName: string;
  branchId: string | null;
  branchName: string | null;
  /** Net hides churn, so in/out are reported too. */
  net: number;
  in: number;
  out: number;
  count: number;
  byReason: Array<{ reason: StockMovementReason; delta: number; count: number }>;
}

export interface InventorySection {
  stores: StoreMovementRow[];
  totalMovements: number;
}

export type SalesEventType =
  | 'invoice_generated'
  | 'invoice_cancelled'
  | 'receipt_created'
  | 'withholding_filed';

export interface SalesEventRow {
  type: SalesEventType;
  occurredAt: Date;
  branchId: string | null;
  branchName: string | null;
  reference: string;
  documentType: string;
  buyerTin: string | null;
  buyerName: string | null;
  preTax: number | null;
  tax: number | null;
  total: number;
  currency: string;
  detail: string | null;
}

export interface ReportPayload {
  window: ReportWindow;
  sections: ReportSection[];
  sales?: SalesSection;
  inventory?: InventorySection;
  /** Caller skips the send and leaves the watermark alone. */
  empty: boolean;
  counts: {
    invoices: number;
    cancellations: number;
    receipts: number;
    movements: number;
  };
}
