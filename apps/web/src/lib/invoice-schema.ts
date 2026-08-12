import { z } from "zod";

export const lineItemSchema = z.object({
  ItemCode: z.string().min(1, "Required"),
  ProductDescription: z.string().min(1, "Required"),
  Unit: z.string().min(1),
  Quantity: z.coerce.number<number>().min(0),
  UnitPrice: z.coerce.number<number>().min(0),
  Discount: z.coerce.number<number>().min(0),
  TaxCode: z.string().min(1),
  TaxRate: z.coerce.number<number>().min(0),
});

export type LineItemInput = z.infer<typeof lineItemSchema>;

export const invoiceFormSchema = z.object({
  TransactionType: z.enum(["B2B", "B2C", "B2G"]),
  NatureOfSupplies: z.enum(["goods", "service"]),
  DocumentNumber: z.string().regex(/^(0|[1-9][0-9]{0,8})$/, "Digits only, max 9"),
  DocumentDate: z.string().min(1),
  DocumentType: z.string().min(1),

  BuyerTin: z.string().min(1),
  BuyerLegalName: z.string().min(1),
  BuyerEmail: z.string().optional(),
  BuyerPhone: z.string().optional(),
  BuyerCity: z.string().optional(),
  BuyerVatNumber: z.string().optional(),
  BuyerHouseNumber: z.string().optional(),
  BuyerIdType: z.string().optional(),
  BuyerIdNumber: z.string().optional(),
  BuyerRegion: z.string().optional(),
  BuyerCountry: z.string().optional(),
  BuyerZone: z.string().optional(),
  BuyerKebele: z.string().optional(),
  BuyerWereda: z.string().optional(),

  PaymentMode: z.string().min(1),
  PaymentTerm: z.string().min(1),

  IncomeWithholdValue: z.coerce.number<number>().min(0),

  CashierName: z.string().min(1),
  SalesPersonName: z.string().min(1),
  InvoiceCounter: z.coerce.number<number>().int().min(0),

  Items: z.array(lineItemSchema).min(1),
});

export type InvoiceFormInput = z.infer<typeof invoiceFormSchema>;

export interface ComputedLine {
  PreTaxValue: number;
  TaxAmount: number;
  TotalLineAmount: number;
}

export function computeLine(item: LineItemInput): ComputedLine {
  const pre = Math.max(0, item.Quantity * item.UnitPrice - item.Discount);
  const tax = +((pre * item.TaxRate) / 100).toFixed(2);
  return {
    PreTaxValue: pre,
    TaxAmount: tax,
    TotalLineAmount: +(pre + tax).toFixed(2),
  };
}

export interface InvoiceTotals {
  PreTax: number;
  Tax: number;
  Total: number;
}

export function computeTotals(items: LineItemInput[]): InvoiceTotals {
  return items.reduce<InvoiceTotals>(
    (acc, item) => {
      const line = computeLine(item);
      return {
        PreTax: +(acc.PreTax + line.PreTaxValue).toFixed(2),
        Tax: +(acc.Tax + line.TaxAmount).toFixed(2),
        Total: +(acc.Total + line.TotalLineAmount).toFixed(2),
      };
    },
    { PreTax: 0, Tax: 0, Total: 0 },
  );
}

export function toEirmsDate(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-");
  if (!y || !m || !d) return yyyyMmDd;
  return `${d}-${m}-${y}T00:00:00`;
}

export function buildCreateInvoicePayload(form: InvoiceFormInput) {
  const items = form.Items.map((item, idx) => {
    const line = computeLine(item);
    return {
      LineNumber: idx + 1,
      ItemCode: item.ItemCode,
      ProductDescription: item.ProductDescription,
      NatureOfSupplies: form.NatureOfSupplies,
      Unit: item.Unit,
      Quantity: item.Quantity,
      UnitPrice: item.UnitPrice,
      Discount: item.Discount,
      ExciseTaxValue: 0,
      TaxCode: item.TaxCode,
      TaxAmount: line.TaxAmount,
      PreTaxValue: line.PreTaxValue,
      TotalLineAmount: line.TotalLineAmount,
      HarmonizationCode: null,
    };
  });
  const totals = computeTotals(form.Items);

  return {
    TransactionType: form.TransactionType,
    BuyerDetails: {
      Tin: form.BuyerTin,
      LegalName: form.BuyerLegalName,
      Email: form.BuyerEmail || undefined,
      Phone: form.BuyerPhone || undefined,
      City: form.BuyerCity || undefined,
      VatNumber: form.BuyerVatNumber || undefined,
      HouseNumber: form.BuyerHouseNumber || undefined,
      IdType: form.BuyerIdType || undefined,
      IdNumber: form.BuyerIdNumber || undefined,
      Region: form.BuyerRegion || undefined,
      Country: form.BuyerCountry || undefined,
      Zone: form.BuyerZone || undefined,
      Kebele: form.BuyerKebele || undefined,
      Wereda: form.BuyerWereda || undefined,
    },
    DocumentDetails: {
      DocumentNumber: form.DocumentNumber,
      Date: toEirmsDate(form.DocumentDate),
      Type: form.DocumentType,
    },
    ItemList: items,
    PaymentDetails: {
      Mode: form.PaymentMode,
      PaymentTerm: form.PaymentTerm,
    },
    ValueDetails: {
      Discount: null,
      ExciseValue: 0,
      TaxValue: totals.Tax,
      IncomeWithholdValue: form.IncomeWithholdValue,
      TransactionWithholdValue: 0,
      TotalValue: totals.Total,
      InvoiceCurrency: "ETB",
    },
    SourceSystem: {
      CashierName: form.CashierName,
      SalesPersonName: form.SalesPersonName,
      InvoiceCounter: form.InvoiceCounter,
    },
  };
}
