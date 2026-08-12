import { EmailRenderer, InvoiceForEmail } from './email-renderer';
import type { NotificationsConfig } from './notifications.config';
import type { EirmsConfig } from '../eirms/eirms.config';

const notifConfig: NotificationsConfig = {
  enabled: true,
  resendApiKey: 'test',
  from: 'Zemen-ePos <einvoice@e-pay.et>',
  merchantCopy: ['ops@e-pay.et'],
  logoUrl: 'https://einvoice.e-pay.et/logo.png',
  appPublicUrl: 'https://einvoice.e-pay.et',
  apiPublicUrl: 'https://eia.e-pay.et',
  redisUrl: 'redis://localhost:6379',
  publicLinkSecret: 'test-secret',
  sms: { enabled: false, baseUrl: '', apiKey: '', shortCode: '' },
};

const eirmsConfig: EirmsConfig = {
  baseUrl: 'http://core.mor.gov.et',
  clientId: 'x',
  clientSecret: 'x',
  apikey: 'x',
  tin: '0000',
  seller: {
    legalName: 'Zemen-ePos Financial Services S.C.',
    email: 'einvoice@e-pay.et',
    phone: '+251911774343',
    region: '1',
    wereda: '13',
    vatNumber: '432566',
  },
};

function invoiceFixture(over: Partial<InvoiceForEmail> = {}): InvoiceForEmail {
  return {
    id: 'inv_1',
    documentNumber: '42',
    irn: 'IRN-ABC-123',
    documentType: 'INV',
    documentDate: '21-03-2025T00:00:00',
    totalValue: 11500,
    currency: 'ETB',
    buyer: { legalName: 'ACME Trading PLC', email: 'buyer@acme.et' },
    cancellation: null,
    signedQR: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    rawRequest: { ReferenceDetails: { RelatedDocument: 'ORIG-IRN-9' } },
    ...over,
  } as unknown as InvoiceForEmail;
}

describe('EmailRenderer', () => {
  const renderer = new EmailRenderer(notifConfig, eirmsConfig);

  it('renders a registered invoice with key fields, QR + view link', async () => {
    const { subject, html } = await renderer.renderInvoice(
      'invoice.registered',
      invoiceFixture(),
    );
    expect(subject).toBe('Invoice #42 registered');
    expect(html).toContain('IRN-ABC-123');
    expect(html).toContain('11500.00 ETB');
    expect(html).toContain('ACME Trading PLC');
    // Buyer-facing link is the public, tokenized Variant 1 invoice page.
    expect(html).toContain('https://einvoice.e-pay.et/p/invoices/inv_1?t=');
    expect(html).toContain('Zemen-ePos Financial Services S.C.');
    // QR embedded as a hosted image served by the public API endpoint
    expect(html).toContain('https://eia.e-pay.et/invoices/inv_1/qr.png');
  });

  it('omits the QR when the document has none', async () => {
    const { html } = await renderer.renderInvoice(
      'invoice.registered',
      invoiceFixture({ signedQR: '' } as Partial<InvoiceForEmail>),
    );
    expect(html).not.toContain('/qr.png');
  });

  it('renders a credit memo referencing the original IRN', async () => {
    const { subject, html } = await renderer.renderInvoice(
      'memo.credit',
      invoiceFixture({ documentType: 'CRE', irn: 'MEMO-IRN-7' } as Partial<InvoiceForEmail>),
    );
    expect(subject).toBe('Credit memo issued');
    expect(html).toContain('MEMO-IRN-7');
    expect(html).toContain('ORIG-IRN-9');
  });
});
