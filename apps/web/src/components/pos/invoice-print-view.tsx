import { TaxInvoiceDocument } from "@/components/pos/tax-invoice-document";
import type { Invoice } from "@/lib/types";

export function InvoicePrintView({
  invoice,
  relatedIrn,
}: {
  invoice: Invoice;
  /** Original invoice IRN for CRE/DEB memos. */
  relatedIrn?: string;
}) {
  return (
    <TaxInvoiceDocument
      invoice={invoice}
      id="invoice-print"
      relatedIrn={relatedIrn}
    />
  );
}
