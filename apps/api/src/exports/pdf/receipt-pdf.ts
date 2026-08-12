import { createWriteStream } from 'node:fs';

import type { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';

export type ReceiptForPdf = Prisma.ReceiptGetPayload<{
  include: {
    merchant: true;
    branch: true;
    invoices: { include: { invoice: { include: { buyer: true } } } };
  };
}>;

export function renderReceiptPdf(
  receipt: ReceiptForPdf,
  destinationPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const stream = createWriteStream(destinationPath);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);
    doc.pipe(stream);

    header(doc, receipt);
    body(doc, receipt);
    footer(doc, receipt);

    doc.end();
  });
}

function header(doc: PDFKit.PDFDocument, receipt: ReceiptForPdf): void {
  doc.fontSize(16).text(receipt.merchant.legalName);
  doc.fontSize(9).fillColor('#555').text(`TIN ${receipt.merchant.tin}`);
  doc.moveDown(0.5);
  doc
    .fillColor('#000')
    .fontSize(13)
    .text(
      receipt.kind === 'WITHHOLD' ? 'Withholding Receipt' : 'Cash Receipt Voucher',
      { align: 'right' },
    );
  doc.fontSize(10).fillColor('#333');
  doc.text(`Receipt #: ${receipt.receiptNumber}`, { align: 'right' });
  if (receipt.rrn) doc.text(`RRN: ${receipt.rrn}`, { align: 'right' });
  doc.text(`Date: ${receipt.receiptDate}`, { align: 'right' });
  doc.fillColor('#000');
  doc.moveDown();
  hr(doc);
}

function body(doc: PDFKit.PDFDocument, receipt: ReceiptForPdf): void {
  doc.fontSize(10);
  const kv = (label: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === '') return;
    doc.fillColor('#555').text(`${label}: `, { continued: true });
    doc.fillColor('#000').text(String(value));
  };
  kv('Type', receipt.receiptType);
  kv('Branch', receipt.branch.name);
  kv('Currency', receipt.receiptCurrency);
  kv('Amount collected', receipt.collectedAmount.toFixed(2));
  if (receipt.kind === 'SALES') {
    kv('Payment mode', receipt.modeOfPayment);
    kv('Collector', receipt.collectorName);
    kv('Provider', receipt.paymentServiceProvider);
    kv('Reference', receipt.documentNumber || receipt.transactionNumber);
  } else {
    kv('Withhold type', receipt.withholdType);
    kv('Pre-tax', receipt.withholdPreTax?.toFixed(2));
    kv('Rate', receipt.withholdRate?.toString());
    kv('Withhold amount', receipt.withholdAmount?.toFixed(2));
    if (receipt.externalInvoiceIrn) {
      kv('External invoice IRN', receipt.externalInvoiceIrn);
    }
  }
  doc.moveDown();
  if (receipt.invoices.length) {
    hr(doc);
    doc.fontSize(10).fillColor('#555').text('Linked invoices');
    doc.fillColor('#000');
    for (const link of receipt.invoices) {
      doc.text(
        `• ${link.invoice.documentNumber}  (${link.invoice.buyer.legalName}, ${link.invoice.totalValue.toFixed(2)} ${link.invoice.currency})`,
      );
    }
  }
}

function footer(doc: PDFKit.PDFDocument, receipt: ReceiptForPdf): void {
  doc.moveDown();
  hr(doc);
  doc.fontSize(8).fillColor('#666');
  doc.text(`Status: ${receipt.eirmsStatus ?? '—'}`);
  doc.text(`Exported from EIRMS×Zemen-ePos — Receipt ${receipt.receiptNumber}`, {
    align: 'center',
  });
}

function hr(doc: PDFKit.PDFDocument): void {
  const y = doc.y;
  doc.moveTo(40, y).lineTo(555, y).strokeColor('#ccc').lineWidth(0.5).stroke();
  doc.strokeColor('#000');
  doc.moveDown(0.5);
}
