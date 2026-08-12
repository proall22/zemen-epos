import { Brand, FeatureItem, InfoRowData, Layout } from './layout';

export interface BuyerEmailStrings {
  preview: string;
  heading: string;
  intro: string;
  cta?: string;
  labels?: Partial<{
    document: string;
    irn: string;
    date: string;
    buyer: string;
    total: string;
    cancelled: string;
    reason: string;
    receiptNumber: string;
    rrn: string;
    amount: string;
    linkedInvoices: string;
    withheldAmount: string;
    supplierIrn: string;
  }>;
}

export interface InvoiceRegisteredProps {
  brand: Brand;
  documentNumber: string;
  irn: string;
  date: string;
  total: string;
  buyerName: string;
  viewUrl?: string;
  qrUrl?: string;
  strings?: BuyerEmailStrings;
}

export function InvoiceRegisteredEmail({
  brand,
  documentNumber,
  irn,
  date,
  total,
  buyerName,
  viewUrl,
  qrUrl,
  strings,
}: InvoiceRegisteredProps) {
  const l = strings?.labels ?? {};
  const rows: InfoRowData[] = [
    { label: l.document ?? 'Document', value: `#${documentNumber}` },
    { label: l.irn ?? 'IRN', value: irn },
    { label: l.date ?? 'Date', value: date },
    { label: l.buyer ?? 'Buyer', value: buyerName },
    { label: l.total ?? 'Total', value: total },
  ];
  return (
    <Layout
      brand={brand}
      preview={
        strings?.preview ?? `Invoice #${documentNumber} registered`
      }
      heading={strings?.heading ?? 'Invoice registered'}
      intro={
        strings?.intro ??
        'Your invoice has been successfully registered with the Ministry of Revenue.'
      }
      rows={rows}
      qrUrl={qrUrl}
      cta={
        viewUrl
          ? {
              label: strings?.cta ?? 'View / download invoice',
              url: viewUrl,
            }
          : undefined
      }
    />
  );
}

export interface InvoiceCancelledProps {
  brand: Brand;
  documentNumber: string;
  irn: string;
  cancelledDate: string;
  reason: string;
  viewUrl?: string;
  qrUrl?: string;
  strings?: BuyerEmailStrings;
}

export function InvoiceCancelledEmail({
  brand,
  documentNumber,
  irn,
  cancelledDate,
  reason,
  viewUrl,
  qrUrl,
  strings,
}: InvoiceCancelledProps) {
  const l = strings?.labels ?? {};
  const rows: InfoRowData[] = [
    { label: l.document ?? 'Document', value: `#${documentNumber}` },
    { label: l.irn ?? 'IRN', value: irn },
    { label: l.cancelled ?? 'Cancelled', value: cancelledDate },
    { label: l.reason ?? 'Reason', value: reason },
  ];
  return (
    <Layout
      brand={brand}
      preview={strings?.preview ?? `Invoice #${documentNumber} cancelled`}
      heading={strings?.heading ?? 'Invoice cancelled'}
      intro={
        strings?.intro ??
        'The following invoice has been cancelled with the Ministry of Revenue.'
      }
      rows={rows}
      qrUrl={qrUrl}
      cta={
        viewUrl
          ? { label: strings?.cta ?? 'View invoice', url: viewUrl }
          : undefined
      }
    />
  );
}

export interface MemoProps {
  brand: Brand;
  memoIrn: string;
  originalIrn: string;
  documentNumber: string;
  total: string;
  viewUrl?: string;
  qrUrl?: string;
  strings?: BuyerEmailStrings;
}

function MemoEmail({
  kind,
  brand,
  memoIrn,
  originalIrn,
  documentNumber,
  total,
  viewUrl,
  qrUrl,
  strings,
}: MemoProps & { kind: 'Credit' | 'Debit' }) {
  const l = strings?.labels ?? {};
  const rows: InfoRowData[] = [
    { label: l.document ?? 'Document', value: `#${documentNumber}` },
    { label: l.irn ?? `${kind} memo IRN`, value: memoIrn },
    // Kept English-only for now: the "original invoice IRN" is a compound
    // label that would need its own key. Follow-up.
    { label: 'Original invoice IRN', value: originalIrn },
    { label: l.total ?? 'Total', value: total },
  ];
  return (
    <Layout
      brand={brand}
      preview={strings?.preview ?? `${kind} memo issued`}
      heading={strings?.heading ?? `${kind} memo issued`}
      intro={
        strings?.intro ??
        `A ${kind.toLowerCase()} memo has been registered against the original invoice.`
      }
      rows={rows}
      qrUrl={qrUrl}
      cta={
        viewUrl
          ? {
              label:
                strings?.cta ?? `View ${kind.toLowerCase()} memo`,
              url: viewUrl,
            }
          : undefined
      }
    />
  );
}

export function CreditMemoEmail(props: MemoProps) {
  return <MemoEmail kind="Credit" {...props} />;
}

export function DebitMemoEmail(props: MemoProps) {
  return <MemoEmail kind="Debit" {...props} />;
}

export interface SalesReceiptProps {
  brand: Brand;
  receiptNumber: string;
  rrn: string;
  amount: string;
  against: string;
  viewUrl?: string;
  qrUrl?: string;
  strings?: BuyerEmailStrings;
}

export function SalesReceiptEmail({
  brand,
  receiptNumber,
  rrn,
  amount,
  against,
  viewUrl,
  qrUrl,
  strings,
}: SalesReceiptProps) {
  const l = strings?.labels ?? {};
  const rows: InfoRowData[] = [
    { label: l.receiptNumber ?? 'Receipt', value: receiptNumber },
    { label: l.rrn ?? 'RRN', value: rrn },
    { label: l.linkedInvoices ?? 'Against', value: against },
    { label: l.amount ?? 'Amount collected', value: amount },
  ];
  return (
    <Layout
      brand={brand}
      preview={strings?.preview ?? `Payment receipt ${receiptNumber}`}
      heading={strings?.heading ?? 'Payment receipt registered'}
      intro={
        strings?.intro ??
        'A payment has been recorded and the receipt registered with the Ministry of Revenue.'
      }
      rows={rows}
      qrUrl={qrUrl}
      cta={
        viewUrl
          ? { label: strings?.cta ?? 'View receipt', url: viewUrl }
          : undefined
      }
    />
  );
}

export interface WithholdingReceiptProps {
  brand: Brand;
  receiptNumber: string;
  rrn: string;
  withheldAmount: string;
  supplierIrn: string;
  viewUrl?: string;
  qrUrl?: string;
  strings?: BuyerEmailStrings;
}

export function WithholdingReceiptEmail({
  brand,
  receiptNumber,
  rrn,
  withheldAmount,
  supplierIrn,
  viewUrl,
  qrUrl,
  strings,
}: WithholdingReceiptProps) {
  const l = strings?.labels ?? {};
  const rows: InfoRowData[] = [
    { label: l.receiptNumber ?? 'Receipt', value: receiptNumber },
    { label: l.rrn ?? 'RRN', value: rrn },
    { label: l.supplierIrn ?? 'Supplier invoice IRN', value: supplierIrn },
    { label: l.withheldAmount ?? 'Withheld', value: withheldAmount },
  ];
  return (
    <Layout
      brand={brand}
      preview={strings?.preview ?? `Withholding receipt ${receiptNumber}`}
      heading={strings?.heading ?? 'Withholding receipt registered'}
      intro={
        strings?.intro ??
        'A withholding receipt has been registered with the Ministry of Revenue.'
      }
      rows={rows}
      qrUrl={qrUrl}
      cta={
        viewUrl
          ? { label: strings?.cta ?? 'View receipt', url: viewUrl }
          : undefined
      }
    />
  );
}

// ===========================================================================
// Merchant lifecycle emails (Phase I + I.1)
//
// Tone notes — these messages go to taxpayers and must read as formal
// correspondence: full sentences, no contractions, no emoji or other
// decorative glyphs, no marketing copy. Open with "Dear ...", sign off with
// "Kind regards", and keep paragraphs short. The Layout component renders
// the body inside a neutral letter frame; we deliberately don't use a hero
// tagline pill (it skews promotional).
// ===========================================================================

/** Capabilities listed in the welcome email — short, factual descriptions of
 *  what the account can do once approved. No emoji titles; the visual cue is
 *  a hairline separator between items, rendered by the Layout. */
const PLATFORM_CAPABILITIES: FeatureItem[] = [
  {
    title: 'Register invoices with the Ministry of Revenue',
    description:
      'Register B2C, B2B, and B2G invoices, including credit and debit notes, with a verifiable signed QR on every document.',
  },
  {
    title: 'Manage multiple branches',
    description:
      'Each branch maintains its own EIRMS credentials, document sequence, and inventory.',
  },
  {
    title: 'File payment and withholding receipts',
    description:
      'Record customer payments and file withholding receipts against supplier invoices from a single workspace.',
  },
  {
    title: 'Notify your buyers automatically',
    description:
      'Buyers receive email and SMS notifications with a QR-verifiable receipt link upon registration.',
  },
];

/** Returns "Dear [Name]," when we know the owner's name; falls back to a
 *  neutral but still formal address. */
function dearLine(ownerName: string | null): string {
  return ownerName ? `Dear ${ownerName},` : 'Dear Sir or Madam,';
}

export interface MerchantWelcomeProps {
  brand: Brand;
  merchantName: string;
  ownerName: string | null;
  /** Where to send them to log in (the SPA root or /login). */
  loginUrl?: string;
}

export function MerchantWelcomeEmail({
  brand,
  merchantName,
  ownerName,
  loginUrl,
}: MerchantWelcomeProps) {
  const intro =
    `${dearLine(ownerName)} thank you for registering ${merchantName} with our ` +
    `e-invoicing platform. We have received your application and it is now under ` +
    `review by our team. The review typically takes one business day, and we will ` +
    `write to you as soon as a decision has been made. In the meantime, you may ` +
    `sign in to update your business details and prepare your branch's EIRMS ` +
    `credentials so that you are ready to issue invoices as soon as the account ` +
    `is approved.`;
  return (
    <Layout
      brand={brand}
      preview={`Your application for ${merchantName} has been received`}
      heading="Thank you for your application"
      intro={intro}
      rows={[
        { label: 'Merchant', value: merchantName },
        { label: 'Status', value: 'Under review' },
      ]}
      features={PLATFORM_CAPABILITIES}
      cta={
        loginUrl
          ? { label: 'Sign in to your account', url: loginUrl }
          : undefined
      }
    />
  );
}

export interface MerchantApprovedProps {
  brand: Brand;
  merchantName: string;
  ownerName: string | null;
  /** Direct deep-link to the merchant's settings page so they can paste EIRMS
   *  credentials and provision cashiers. */
  dashboardUrl?: string;
}

export function MerchantApprovedEmail({
  brand,
  merchantName,
  ownerName,
  dashboardUrl,
}: MerchantApprovedProps) {
  const intro =
    `${dearLine(ownerName)} we are pleased to inform you that the account for ` +
    `${merchantName} has been approved. You may now register invoices and receipts ` +
    `with the Ministry of Revenue through your account. Before issuing your first ` +
    `invoice, please complete the steps below.`;
  return (
    <Layout
      brand={brand}
      tone="success"
      preview={`Your account for ${merchantName} has been approved`}
      heading="Your account has been approved"
      intro={intro}
      rows={[
        { label: 'Merchant', value: merchantName },
        { label: 'Status', value: 'Active' },
      ]}
      features={[
        {
          title: 'Enter your EIRMS credentials',
          description:
            'Open the branch from which you will issue invoices and enter the Client ID, Client Secret, and API Key issued to you by the Ministry of Revenue.',
        },
        {
          title: "Verify your branch's address",
          description:
            'Make sure your branch address details are accurate and complete — they appear on every invoice you issue.',
        },
        {
          title: 'Add additional users (optional)',
          description:
            'Invite cashiers, accountants, or support staff who will issue invoices or reconcile receipts on your behalf.',
        },
      ]}
      cta={
        dashboardUrl
          ? { label: 'Go to your account', url: dashboardUrl }
          : undefined
      }
    />
  );
}

export interface MerchantRejectedProps {
  brand: Brand;
  merchantName: string;
  ownerName: string | null;
  /** Reason captured by the reviewer. Optional. */
  reason: string | null;
  /** Where the merchant can write back. Falls back to brand.sellerEmail. */
  supportEmail?: string;
}

export function MerchantRejectedEmail({
  brand,
  merchantName,
  ownerName,
  reason,
  supportEmail,
}: MerchantRejectedProps) {
  const contact = supportEmail || brand.sellerEmail;
  const intro =
    `${dearLine(ownerName)} thank you for your interest in our e-invoicing ` +
    `platform. We regret to inform you that we are unable to approve the ` +
    `application for ${merchantName} at this time. Should the issue be ` +
    `resolvable — for example, an updated business detail or a corrected TIN — ` +
    `you are welcome to reply to this message with the corrected information and ` +
    `we will be pleased to re-review your application promptly.`;
  return (
    <Layout
      brand={brand}
      tone="warning"
      preview={`Update on your application for ${merchantName}`}
      heading="We are unable to approve your application"
      intro={intro}
      rows={[
        { label: 'Merchant', value: merchantName },
        {
          label: 'Reason',
          value:
            reason && reason.trim()
              ? reason.trim()
              : 'No specific reason was recorded.',
        },
        ...(contact ? [{ label: 'Contact', value: contact }] : []),
      ]}
    />
  );
}

// --- Enable / disable ------------------------------------------------------

export interface MerchantEnabledProps {
  brand: Brand;
  merchantName: string;
  ownerName: string | null;
  dashboardUrl?: string;
}

export function MerchantEnabledEmail({
  brand,
  merchantName,
  ownerName,
  dashboardUrl,
}: MerchantEnabledProps) {
  const intro =
    `${dearLine(ownerName)} we are writing to inform you that the account for ` +
    `${merchantName} has been reactivated. You may resume registering invoices ` +
    `and receipts immediately. If you have any questions about this change, ` +
    `please reply to this message.`;
  return (
    <Layout
      brand={brand}
      tone="success"
      preview={`Your account for ${merchantName} has been reactivated`}
      heading="Your account has been reactivated"
      intro={intro}
      rows={[
        { label: 'Merchant', value: merchantName },
        { label: 'Status', value: 'Active' },
      ]}
      cta={
        dashboardUrl
          ? { label: 'Go to your account', url: dashboardUrl }
          : undefined
      }
    />
  );
}

export interface MerchantDisabledProps {
  brand: Brand;
  merchantName: string;
  ownerName: string | null;
  /** Where the merchant can write back. Falls back to brand.sellerEmail. */
  supportEmail?: string;
}

export interface MerchantExportReadyProps {
  brand: Brand;
  merchantName: string;
  ownerName: string | null;
  invoiceCount: number;
  receiptCount: number;
  inventoryCount: number;
  buyerCount: number;
  fileSize: string;
  expiresAt: string;
  downloadUrl?: string;
}

export function MerchantExportReadyEmail({
  brand,
  merchantName,
  ownerName,
  invoiceCount,
  receiptCount,
  inventoryCount,
  buyerCount,
  fileSize,
  expiresAt,
  downloadUrl,
}: MerchantExportReadyProps) {
  const intro =
    `${dearLine(ownerName)} the full data export you requested for ` +
    `${merchantName} is ready. The bundle contains every invoice, receipt, ` +
    `inventory item and buyer record we hold for your account, with both ` +
    `machine-readable JSON and printable PDF copies for invoices and receipts. ` +
    `The link below will remain available until ${expiresAt}.`;
  return (
    <Layout
      brand={brand}
      tone="success"
      preview={`Your data export for ${merchantName} is ready`}
      heading="Your data export is ready"
      intro={intro}
      rows={[
        { label: 'Merchant', value: merchantName },
        { label: 'Invoices', value: String(invoiceCount) },
        { label: 'Receipts', value: String(receiptCount) },
        { label: 'Inventory items', value: String(inventoryCount) },
        { label: 'Buyers', value: String(buyerCount) },
        { label: 'Bundle size', value: fileSize },
        { label: 'Expires', value: expiresAt },
      ]}
      cta={
        downloadUrl
          ? { label: 'Open your exports', url: downloadUrl }
          : undefined
      }
    />
  );
}

export interface MerchantExportFailedProps {
  brand: Brand;
  merchantName: string;
  ownerName: string | null;
  supportEmail?: string;
}

export function MerchantExportFailedEmail({
  brand,
  merchantName,
  ownerName,
  supportEmail,
}: MerchantExportFailedProps) {
  const contact = supportEmail || brand.sellerEmail;
  const intro =
    `${dearLine(ownerName)} the data export you requested for ${merchantName} ` +
    `could not be completed. Our team has been notified and will investigate. ` +
    `You can retry the export from your account, or reply to this email if ` +
    `you would like assistance.`;
  return (
    <Layout
      brand={brand}
      tone="warning"
      preview={`Your data export for ${merchantName} could not be completed`}
      heading="Data export failed"
      intro={intro}
      rows={[
        { label: 'Merchant', value: merchantName },
        { label: 'Status', value: 'Failed' },
        ...(contact ? [{ label: 'Contact', value: contact }] : []),
      ]}
    />
  );
}

export function MerchantDisabledEmail({
  brand,
  merchantName,
  ownerName,
  supportEmail,
}: MerchantDisabledProps) {
  const contact = supportEmail || brand.sellerEmail;
  const intro =
    `${dearLine(ownerName)} we are writing to inform you that the account for ` +
    `${merchantName} has been deactivated. Registration of invoices and receipts ` +
    `is paused while the account is in this state. If you would like to ` +
    `understand the reason for this change or have the matter reviewed, please ` +
    `reply to this message and a member of our team will be in touch.`;
  return (
    <Layout
      brand={brand}
      tone="warning"
      preview={`Your account for ${merchantName} has been deactivated`}
      heading="Your account has been deactivated"
      intro={intro}
      rows={[
        { label: 'Merchant', value: merchantName },
        { label: 'Status', value: 'Deactivated' },
        ...(contact ? [{ label: 'Contact', value: contact }] : []),
      ]}
    />
  );
}

export interface PasswordResetProps {
  brand: Brand;
  recipientName: string | null;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface ConsentRequestProps {
  brand: Brand;
  recipientName: string | null;
  merchantName: string;
  requesterEmail: string;
  scopeLabels: string[];
  proposedDuration: string;
  decisionUrl: string;
  linkExpires: string;
}

export function ConsentRequestEmail({
  brand,
  recipientName,
  merchantName,
  requesterEmail,
  scopeLabels,
  proposedDuration,
  decisionUrl,
  linkExpires,
}: ConsentRequestProps) {
  const intro =
    `${dearLine(recipientName)} a platform administrator (${requesterEmail}) is ` +
    `requesting temporary access to ${merchantName}. No access is granted until ` +
    `you approve it — open the link below while signed in to review the request ` +
    `and choose how long access should last. You can decline, and you can revoke ` +
    `access at any time afterwards.`;
  return (
    <Layout
      brand={brand}
      tone="warning"
      preview={`Access request for ${merchantName}`}
      heading="Platform access request"
      intro={intro}
      rows={[
        { label: 'Merchant', value: merchantName },
        { label: 'Requested by', value: requesterEmail },
        { label: 'Access to', value: scopeLabels.join(', ') },
        { label: 'Requested duration', value: proposedDuration },
        { label: 'Link expires', value: linkExpires },
      ]}
      cta={{ label: 'Review this request', url: decisionUrl }}
    />
  );
}

export function PasswordResetEmail({
  brand,
  recipientName,
  resetUrl,
  expiresInMinutes,
}: PasswordResetProps) {
  const intro =
    `${dearLine(recipientName)} we received a request to reset the password ` +
    `on your account. Use the link below within ${expiresInMinutes} minutes ` +
    `to choose a new password. If you didn't request this, you can safely ` +
    `ignore this message — your password stays unchanged.`;
  return (
    <Layout
      brand={brand}
      tone="neutral"
      preview="Reset your password"
      heading="Reset your password"
      intro={intro}
      rows={[
        { label: 'Expires', value: `${expiresInMinutes} minutes` },
      ]}
      cta={{ label: 'Choose a new password', url: resetUrl }}
    />
  );
}

export interface ScheduledReportProps {
  brand: Brand;
  reportName: string;
  merchantName: string;
  scopeLabel: string;
  windowLabel: string;
  /** Rendered when earlier windows were skipped as empty, so the recipient
   *  can see the timeline has no hole in it. */
  skippedLabel?: string | null;
  rows: InfoRowData[];
  attachmentNote?: string | null;
  truncatedNote?: string | null;
}

export function ScheduledReportEmail({
  brand,
  reportName,
  merchantName,
  scopeLabel,
  windowLabel,
  skippedLabel,
  rows,
  attachmentNote,
  truncatedNote,
}: ScheduledReportProps) {
  const intro = [
    `Activity for ${merchantName} (${scopeLabel}) covering ${windowLabel}.`,
    skippedLabel ? `No activity ${skippedLabel}.` : null,
    truncatedNote,
    attachmentNote,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Layout
      brand={brand}
      tone="neutral"
      preview={`${reportName} — ${windowLabel}`}
      tagline={reportName}
      heading="Your scheduled report"
      intro={intro}
      rows={rows}
    />
  );
}
