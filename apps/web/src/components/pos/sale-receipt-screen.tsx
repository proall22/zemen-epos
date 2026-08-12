import { Plus, Printer } from "lucide-react";

import { TaxInvoiceDocument } from "@/components/pos/tax-invoice-document";
import { Button } from "@/components/ui/button";
import type { Invoice, Receipt } from "@/lib/types";

export interface SaleReceiptScreenProps {
  invoice: Invoice;
  receipt: Receipt;
  onNewSale: () => void;
}

export function SaleReceiptScreen({
  invoice,
  receipt,
  onNewSale,
}: SaleReceiptScreenProps) {
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-6 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Button type="button" variant="outline" onClick={onNewSale}>
          <Plus /> New sale
        </Button>
        <Button
          type="button"
          onClick={() => window.print()}
          className="bg-[#5700FF] text-white hover:bg-[#5700FF]/90"
        >
          <Printer /> Print receipt
        </Button>
      </div>

      <TaxInvoiceDocument
        invoice={invoice}
        receipt={receipt}
        id="receipt-print"
      />
    </div>
  );
}
