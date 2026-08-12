import { createWriteStream } from 'node:fs';

import type { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';

export type InvoiceForPdf = Prisma.InvoiceGetPayload<{
  include: { items: true; buyer: true; merchant: true; branch: true };
}>;

export function renderInvoicePdf(
  invoice: InvoiceForPdf,
  destinationPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const stream = createWriteStream(destinationPath);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);
    doc.pipe(stream);

    header(doc, invoice);
    parties(doc, invoice);
    itemsTable(doc, invoice);
    totals(doc, invoice);
    footer(doc, invoice);

    doc.end();
  });
}

function header(doc: PDFKit.PDFDocument, invoice: InvoiceForPdf): void {
  doc.fontSize(16).text(invoice.merchant.legalName, { align: 'left' });
  doc
    .fontSize(9)
    .fillColor('#555')
    .text(
      [invoice.merchant.tradeName, `TIN ${invoice.merchant.tin}`]
        .filter(Boolean)
        .join(' • '),
    );
  doc.moveDown(0.5);
  doc.fillColor('#000').fontSize(13).text('Tax Invoice', { align: 'right' });
  doc
    .fontSize(10)
    .fillColor('#333')
    .text(`IRN: ${invoice.irn}`, { align: 'right' });
  doc.text(`Document #: ${invoice.documentNumber}`, { align: 'right' });
  doc.text(`Date: ${invoice.documentDate}`, { align: 'right' });
  doc.moveDown();
  doc.fillColor('#000');
  hr(doc);
}

function parties(doc: PDFKit.PDFDocument, invoice: InvoiceForPdf): void {
  const topY = doc.y;
  doc.fontSize(10).fillColor('#555').text('Seller');
  doc.fillColor('#000').text(invoice.merchant.legalName);
  doc.text(
    [invoice.branch.name, invoice.branch.city, invoice.branch.region]
      .filter(Boolean)
      .join(', ') || '—',
  );

  doc.fontSize(10).fillColor('#555').text('Buyer', 300, topY);
  doc.fillColor('#000').text(invoice.buyer.legalName, 300);
  doc.text(`TIN ${invoice.buyer.tin}`, 300);
  doc.text(
    [invoice.buyer.city, invoice.buyer.region].filter(Boolean).join(', ') ||
      '—',
    300,
  );
  doc.moveDown();
  doc.x = 40;
  doc.moveDown();
  hr(doc);
}

function itemsTable(doc: PDFKit.PDFDocument, invoice: InvoiceForPdf): void {
  const cols = {
    line: 40,
    desc: 70,
    qty: 320,
    unit: 370,
    price: 420,
    total: 490,
  };
  const headerY = doc.y;
  doc.fontSize(9).fillColor('#555');
  doc.text('#', cols.line, headerY);
  doc.text('Description', cols.desc, headerY);
  doc.text('Qty', cols.qty, headerY, { width: 40, align: 'right' });
  doc.text('Unit', cols.unit, headerY, { width: 40, align: 'right' });
  doc.text('Price', cols.price, headerY, { width: 60, align: 'right' });
  doc.text('Total', cols.total, headerY, { width: 60, align: 'right' });
  doc.moveDown();
  hr(doc);

  doc.fillColor('#000').fontSize(9);
  for (const item of invoice.items.sort(
    (a, b) => a.lineNumber - b.lineNumber,
  )) {
    const y = doc.y;
    doc.text(String(item.lineNumber), cols.line, y, { width: 25 });
    doc.text(item.description, cols.desc, y, { width: 240 });
    doc.text(item.quantity.toString(), cols.qty, y, {
      width: 40,
      align: 'right',
    });
    doc.text(item.unit, cols.unit, y, { width: 40, align: 'right' });
    doc.text(item.unitPrice.toFixed(2), cols.price, y, {
      width: 60,
      align: 'right',
    });
    doc.text(item.totalAmount.toFixed(2), cols.total, y, {
      width: 60,
      align: 'right',
    });
    doc.moveDown();
  }
  hr(doc);
}

function totals(doc: PDFKit.PDFDocument, invoice: InvoiceForPdf): void {
  doc.moveDown(0.5);
  const lineY = doc.y;
  const labelX = 380;
  const valueX = 480;
  doc.fontSize(10).fillColor('#000');
  let y = lineY;
  doc.text('Subtotal', labelX, y);
  doc.text(invoice.preTaxValue.toFixed(2), valueX, y, {
    width: 80,
    align: 'right',
  });
  y += 16;
  doc.text(`Tax (${invoice.currency})`, labelX, y);
  doc.text(invoice.taxValue.toFixed(2), valueX, y, {
    width: 80,
    align: 'right',
  });
  if (invoice.withholdValue) {
    y += 16;
    doc.text('Withhold', labelX, y);
    doc.text(invoice.withholdValue.toFixed(2), valueX, y, {
      width: 80,
      align: 'right',
    });
  }
  y += 18;
  doc.fontSize(11).fillColor('#000').text('Total', labelX, y);
  doc.text(invoice.totalValue.toFixed(2), valueX, y, {
    width: 80,
    align: 'right',
  });
  doc.y = y + 24;
}

function footer(doc: PDFKit.PDFDocument, invoice: InvoiceForPdf): void {
  doc.x = 40;
  doc.moveDown();
  hr(doc);
  doc.fontSize(8).fillColor('#666');
  doc.text(
    `Cashier: ${invoice.cashierName}  •  Salesperson: ${invoice.salespersonName}`,
  );
  doc.text(
    `Status: ${invoice.status}  •  Source: ${invoice.source}  •  Payment: ${invoice.paymentStatus}`,
  );
  doc.text(`Ack date (EIRMS): ${invoice.ackDate}`);
  doc.text(`Exported from EIRMS×Zemen-ePos — IRN ${invoice.irn}`, {
    align: 'center',
  });
}

function hr(doc: PDFKit.PDFDocument): void {
  const y = doc.y;
  doc.moveTo(40, y).lineTo(555, y).strokeColor('#ccc').lineWidth(0.5).stroke();
  doc.strokeColor('#000');
  doc.moveDown(0.5);
}
