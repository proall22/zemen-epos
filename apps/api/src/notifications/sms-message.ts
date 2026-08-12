import type { NotificationsI18nService } from './i18n';
import { NotificationAction } from './notifications.types';

type InvoiceAction = Extract<
  NotificationAction,
  'invoice.registered' | 'invoice.cancelled' | 'memo.credit' | 'memo.debit'
>;

interface InvoiceSmsFields {
  documentNumber: string;
  totalValue: number;
  currency: string;
  irn: string | null;
}

interface ReceiptSmsFields {
  receiptNumber: string;
  collectedAmount: number;
  withholdAmount: number | null;
  receiptCurrency: string;
  rrn: string | null;
  /** IRN of the invoice the receipt settles (sales) or the supplier invoice
   *  (withholding), when known. */
  relatedIrn: string | null;
}

/**
 * Build the trailing reference block (IRN / RRN / QR / invoice URL). Runs
 * every candidate through the translator so a merchant that overrode e.g.
 * the `IRN:` prefix still gets it here.
 */
async function tailRefs(
  parts: Array<{ key: string; params: Record<string, string> } | undefined>,
  i18n: NotificationsI18nService,
  language: string,
): Promise<string> {
  const kept: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    kept.push(await i18n.t(p.key, p.params, language));
  }
  return kept.length ? ` ${kept.join(' ')}` : '';
}

/**
 * Buyer-facing SMS for an invoice/memo event, rendered in the recipient's
 * language. `invoiceUrl` is the public printable Variant 1 invoice page.
 */
export async function buildInvoiceSms(
  action: InvoiceAction,
  invoice: InvoiceSmsFields,
  opts: {
    seller: string;
    invoiceUrl?: string;
    language: string;
    i18n: NotificationsI18nService;
  },
): Promise<string> {
  const money = `${invoice.totalValue.toFixed(2)} ${invoice.currency}`;
  const refs = await tailRefs(
    [
      invoice.irn
        ? { key: 'notifications.sms.refs.irn', params: { irn: invoice.irn } }
        : undefined,
      opts.invoiceUrl
        ? {
            key: 'notifications.sms.refs.invoiceUrl',
            params: { url: opts.invoiceUrl },
          }
        : undefined,
    ],
    opts.i18n,
    opts.language,
  );
  return opts.i18n.t(
    `notifications.sms.${action}`,
    {
      docNumber: invoice.documentNumber,
      seller: opts.seller,
      total: money,
      refs,
    },
    opts.language,
  );
}

/**
 * Buyer-facing SMS for a receipt event, rendered in the recipient's
 * language. Receipts keep the QR link.
 */
export async function buildReceiptSms(
  action: Extract<NotificationAction, 'receipt.sales' | 'receipt.withholding'>,
  receipt: ReceiptSmsFields,
  opts: {
    seller: string;
    qrUrl?: string;
    language: string;
    i18n: NotificationsI18nService;
  },
): Promise<string> {
  const refs = await tailRefs(
    [
      receipt.relatedIrn
        ? {
            key: 'notifications.sms.refs.irn',
            params: { irn: receipt.relatedIrn },
          }
        : undefined,
      receipt.rrn
        ? {
            key: 'notifications.sms.refs.rrn',
            params: { rrn: receipt.rrn },
          }
        : undefined,
      opts.qrUrl
        ? {
            key: 'notifications.sms.refs.qrUrl',
            params: { url: opts.qrUrl },
          }
        : undefined,
    ],
    opts.i18n,
    opts.language,
  );
  const amount =
    action === 'receipt.withholding'
      ? `${(receipt.withholdAmount ?? receipt.collectedAmount).toFixed(2)} ${receipt.receiptCurrency}`
      : `${receipt.collectedAmount.toFixed(2)} ${receipt.receiptCurrency}`;
  return opts.i18n.t(
    `notifications.sms.${action}`,
    {
      seller: opts.seller,
      receiptNumber: receipt.receiptNumber,
      amount,
      refs,
    },
    opts.language,
  );
}
