import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { render } from '@react-email/render';

import { publicInvoiceUrl, publicReceiptUrl } from '../common/public-link';
import { eirmsConfig } from '../eirms/eirms.config';
import { NotificationsI18nService } from './i18n';
import { notificationsConfig } from './notifications.config';
import {
  ConsentRequestEmail,
  CreditMemoEmail,
  DebitMemoEmail,
  InvoiceCancelledEmail,
  InvoiceRegisteredEmail,
  MerchantApprovedEmail,
  MerchantDisabledEmail,
  MerchantEnabledEmail,
  MerchantExportFailedEmail,
  MerchantExportReadyEmail,
  ScheduledReportEmail,
  MerchantRejectedEmail,
  MerchantWelcomeEmail,
  PasswordResetEmail,
  SalesReceiptEmail,
  WithholdingReceiptEmail,
  type BuyerEmailStrings,
} from './templates/bodies';
import { Brand, InfoRowData } from './templates/layout';
import { NotificationAction } from './notifications.types';

export type InvoiceForEmail = Prisma.InvoiceGetPayload<{
  include: { buyer: true; cancellation: true; merchant: true };
}>;

export type ReceiptForEmail = Prisma.ReceiptGetPayload<{
  include: { invoices: { include: { invoice: true } }; merchant: true };
}>;

export interface RenderedEmail {
  subject: string;
  html: string;
}

@Injectable()
export class EmailRenderer {
  constructor(
    @Inject(notificationsConfig.KEY)
    private readonly config: ConfigType<typeof notificationsConfig>,
    @Inject(eirmsConfig.KEY)
    private readonly eirms: ConfigType<typeof eirmsConfig>,
    private readonly i18n: NotificationsI18nService,
  ) {}

  /**
   * Pre-resolve every localizable string for a buyer-facing email in the
   * recipient's language. Returned object is spread into the corresponding
   * template's `strings` prop.
   */
  private async resolveBuyerStrings(
    action:
      | 'invoice.registered'
      | 'invoice.cancelled'
      | 'memo.credit'
      | 'memo.debit'
      | 'receipt.sales'
      | 'receipt.withholding',
    language: string,
    params: Record<string, string | number>,
  ): Promise<BuyerEmailStrings> {
    const prefix = `notifications.email.${action}`;
    const [preview, heading, intro, cta] = await this.i18n.tMany(
      [
        { key: `${prefix}.subject`, params },
        { key: `${prefix}.heading`, params },
        { key: `${prefix}.body`, params },
        { key: `${prefix}.cta`, params },
      ],
      language,
    );
    const labelKeys: Array<keyof NonNullable<BuyerEmailStrings['labels']>> = [
      'document',
      'irn',
      'date',
      'buyer',
      'total',
      'cancelled',
      'reason',
      'receiptNumber',
      'rrn',
      'amount',
      'linkedInvoices',
      'withheldAmount',
      'supplierIrn',
    ];
    const labelValues = await this.i18n.tMany(
      labelKeys.map((k) => ({ key: `notifications.email.rows.${k}` })),
      language,
    );
    const labels: BuyerEmailStrings['labels'] = {};
    labelKeys.forEach((k, i) => {
      labels[k] = labelValues[i];
    });
    return {
      preview,
      heading,
      intro,
      cta,
      labels,
    };
  }

  private async subjectFor(
    action: string,
    language: string,
    params: Record<string, string | number>,
  ): Promise<string> {
    return this.i18n.t(
      `notifications.email.${action}.subject`,
      params,
      language,
    );
  }

  /** Brand panel on the email — sourced from the invoice's / receipt's own
   *  merchant, with the eirmsConfig.seller env values as a fallback for cases
   *  where the merchant is somehow null (shouldn't happen post-migration, but
   *  the fallback keeps emails sending instead of throwing). */
  private brandFor(record: {
    merchant?: {
      legalName: string;
      email: string | null;
      phone: string | null;
    } | null;
  }): Brand {
    const m = record.merchant;
    return {
      sellerName: m?.legalName ?? this.eirms.seller.legalName,
      logoUrl: this.config.logoUrl,
      sellerEmail: m?.email ?? this.eirms.seller.email,
      sellerPhone: m?.phone ?? this.eirms.seller.phone,
    };
  }

  /** Buyer-facing printable Variant 1 invoice page (tokenized, public). The
   *  staff `/invoices/:id` route needs a login, so emails link this instead. */
  private invoiceUrl(id: string): string | undefined {
    return publicInvoiceUrl(
      this.config.appPublicUrl,
      id,
      this.config.publicLinkSecret,
    );
  }

  /** Buyer-facing printable receipt page (tokenized, public). Mirrors
   *  {@link invoiceUrl} — the staff `/receipts/:id` route needs a login, so
   *  emails link `/p/receipts/:id?t=…` instead. */
  private receiptUrl(id: string): string | undefined {
    return publicReceiptUrl(
      this.config.appPublicUrl,
      id,
      this.config.publicLinkSecret,
    );
  }

  /** Hosted QR PNG served by the public API endpoint. Returns undefined when
   *  there's no QR or no configured API base URL (the template then omits it). */
  private qrUrl(
    kind: 'invoices' | 'receipts',
    id: string,
    signedQR: string | null | undefined,
  ): string | undefined {
    return signedQR && this.config.apiPublicUrl
      ? `${this.config.apiPublicUrl}/${kind}/${id}/qr.png`
      : undefined;
  }

  async renderInvoice(
    action: Extract<
      NotificationAction,
      'invoice.registered' | 'invoice.cancelled' | 'memo.credit' | 'memo.debit'
    >,
    invoice: InvoiceForEmail,
    language: string = 'en',
  ): Promise<RenderedEmail> {
    const money = `${invoice.totalValue.toFixed(2)} ${invoice.currency}`;
    const qrUrl = this.qrUrl('invoices', invoice.id, invoice.signedQR);
    const sellerName = this.brandFor(invoice).sellerName;
    const commonParams = {
      docNumber: invoice.documentNumber,
      seller: sellerName,
      total: money,
    };
    switch (action) {
      case 'invoice.registered': {
        const strings = await this.resolveBuyerStrings(
          action,
          language,
          commonParams,
        );
        return {
          subject: await this.subjectFor(action, language, commonParams),
          html: await render(
            InvoiceRegisteredEmail({
              brand: this.brandFor(invoice),
              documentNumber: invoice.documentNumber,
              irn: invoice.irn,
              date: dateOnly(invoice.documentDate),
              total: money,
              buyerName: invoice.buyer.legalName,
              viewUrl: this.invoiceUrl(invoice.id),
              qrUrl,
              strings,
            }),
          ),
        };
      }
      case 'invoice.cancelled': {
        const reason =
          invoice.cancellation?.remark ||
          invoice.cancellation?.reasonCode ||
          '—';
        const params = { ...commonParams, reason };
        const strings = await this.resolveBuyerStrings(
          action,
          language,
          params,
        );
        return {
          subject: await this.subjectFor(action, language, params),
          html: await render(
            InvoiceCancelledEmail({
              brand: this.brandFor(invoice),
              documentNumber: invoice.documentNumber,
              irn: invoice.irn,
              cancelledDate: invoice.cancellation?.createdAt
                ? invoice.cancellation.createdAt.toISOString().slice(0, 10)
                : dateOnly(invoice.documentDate),
              reason,
              // Public invoice page renders cancelled invoices fine — the
              // same tokenised link works whether the doc is ACCEPTED or
              // CANCELLED. Buyer needs this to confirm the cancellation
              // and save the record.
              viewUrl: this.invoiceUrl(invoice.id),
              qrUrl,
              strings,
            }),
          ),
        };
      }
      case 'memo.credit':
      case 'memo.debit': {
        const Email =
          action === 'memo.credit' ? CreditMemoEmail : DebitMemoEmail;
        const strings = await this.resolveBuyerStrings(
          action,
          language,
          commonParams,
        );
        return {
          subject: await this.subjectFor(action, language, commonParams),
          html: await render(
            Email({
              brand: this.brandFor(invoice),
              documentNumber: invoice.documentNumber,
              memoIrn: invoice.irn,
              originalIrn: previousIrnOf(invoice),
              total: money,
              viewUrl: this.invoiceUrl(invoice.id),
              qrUrl,
              strings,
            }),
          ),
        };
      }
    }
  }

  async renderReceipt(
    action: Extract<
      NotificationAction,
      'receipt.sales' | 'receipt.withholding'
    >,
    receipt: ReceiptForEmail,
    language: string = 'en',
  ): Promise<RenderedEmail> {
    const qrUrl = this.qrUrl('receipts', receipt.id, receipt.signedQR);
    const viewUrl = this.receiptUrl(receipt.id);
    const sellerName = this.brandFor(receipt).sellerName;
    if (action === 'receipt.withholding') {
      const amount = `${(receipt.withholdAmount ?? receipt.collectedAmount).toFixed(2)} ${receipt.receiptCurrency}`;
      const params = {
        receiptNumber: receipt.receiptNumber,
        seller: sellerName,
        amount,
      };
      const strings = await this.resolveBuyerStrings(action, language, params);
      return {
        subject: await this.subjectFor(action, language, params),
        html: await render(
          WithholdingReceiptEmail({
            brand: this.brandFor(receipt),
            receiptNumber: receipt.receiptNumber,
            rrn: receipt.rrn ?? '—',
            withheldAmount: amount,
            supplierIrn: receipt.externalInvoiceIrn ?? '—',
            viewUrl,
            qrUrl,
            strings,
          }),
        ),
      };
    }
    const against =
      receipt.invoices.map((l) => `#${l.invoice.documentNumber}`).join(', ') ||
      '—';
    const amount = `${receipt.collectedAmount.toFixed(2)} ${receipt.receiptCurrency}`;
    const params = {
      receiptNumber: receipt.receiptNumber,
      seller: sellerName,
      amount,
    };
    const strings = await this.resolveBuyerStrings(action, language, params);
    return {
      subject: await this.subjectFor(action, language, params),
      html: await render(
        SalesReceiptEmail({
          brand: this.brandFor(receipt),
          receiptNumber: receipt.receiptNumber,
          rrn: receipt.rrn ?? '—',
          amount,
          against,
          viewUrl,
          qrUrl,
          strings,
        }),
      ),
    };
  }

  /** Lifecycle emails sent to the merchant owner. The owner's display name
   *  is optional — falls back to a neutral greeting. The dashboardUrl / loginUrl
   *  resolve to the configured appPublicUrl when present so the recipient lands
   *  in a useful place. */
  async renderMerchant(
    action: Extract<
      NotificationAction,
      | 'merchant.signup'
      | 'merchant.approved'
      | 'merchant.rejected'
      | 'merchant.enabled'
      | 'merchant.disabled'
    >,
    merchant: MerchantForEmail,
    owner: { name: string | null },
  ): Promise<RenderedEmail> {
    const brand = this.brandFor({ merchant });
    const merchantName = merchant.legalName;
    const appUrl = this.config.appPublicUrl;
    const supportEmail = this.eirms.seller.email || undefined;
    switch (action) {
      case 'merchant.signup':
        return {
          subject: `Your application for ${merchantName} has been received`,
          html: await render(
            MerchantWelcomeEmail({
              brand,
              merchantName,
              ownerName: owner.name,
              loginUrl: appUrl ? `${appUrl}/login` : undefined,
            }),
          ),
        };
      case 'merchant.approved':
        return {
          subject: `Your account for ${merchantName} has been approved`,
          html: await render(
            MerchantApprovedEmail({
              brand,
              merchantName,
              ownerName: owner.name,
              dashboardUrl: appUrl ? `${appUrl}/merchants` : undefined,
            }),
          ),
        };
      case 'merchant.rejected':
        return {
          subject: `Update on your application for ${merchantName}`,
          html: await render(
            MerchantRejectedEmail({
              brand,
              merchantName,
              ownerName: owner.name,
              reason: merchant.rejectionReason,
              supportEmail,
            }),
          ),
        };
      case 'merchant.enabled':
        return {
          subject: `Your account for ${merchantName} has been reactivated`,
          html: await render(
            MerchantEnabledEmail({
              brand,
              merchantName,
              ownerName: owner.name,
              dashboardUrl: appUrl ? `${appUrl}/merchants` : undefined,
            }),
          ),
        };
      case 'merchant.disabled':
        return {
          subject: `Your account for ${merchantName} has been deactivated`,
          html: await render(
            MerchantDisabledEmail({
              brand,
              merchantName,
              ownerName: owner.name,
              supportEmail,
            }),
          ),
        };
    }
  }

  async renderPasswordReset(
    payload: PasswordResetRenderPayload,
  ): Promise<RenderedEmail> {
    const brand: Brand = {
      sellerName: this.eirms.seller.legalName,
      logoUrl: this.config.logoUrl,
      sellerEmail: this.eirms.seller.email,
      sellerPhone: this.eirms.seller.phone,
    };
    return {
      subject: 'Reset your password',
      html: await render(
        PasswordResetEmail({
          brand,
          recipientName: payload.recipientName,
          resetUrl: payload.resetUrl,
          expiresInMinutes: payload.expiresInMinutes,
        }),
      ),
    };
  }

  async renderConsentRequest(
    payload: ConsentRequestRenderPayload,
  ): Promise<RenderedEmail> {
    // Platform-level email (a super-admin requesting access) — use the platform
    // brand rather than the target merchant's.
    const brand: Brand = {
      sellerName: this.eirms.seller.legalName,
      logoUrl: this.config.logoUrl,
      sellerEmail: this.eirms.seller.email,
      sellerPhone: this.eirms.seller.phone,
    };
    return {
      subject: `Access request for ${payload.merchantName}`,
      html: await render(
        ConsentRequestEmail({
          brand,
          recipientName: payload.recipientName,
          merchantName: payload.merchantName,
          requesterEmail: payload.requesterEmail,
          scopeLabels: payload.scopeLabels,
          proposedDuration: payload.proposedDuration,
          decisionUrl: payload.decisionUrl,
          linkExpires: payload.linkExpires,
        }),
      ),
    };
  }

  async renderExport(
    action: Extract<
      NotificationAction,
      'merchant.export.ready' | 'merchant.export.failed'
    >,
    merchant: MerchantForEmail,
    owner: { name: string | null },
    payload: ExportRenderPayload,
  ): Promise<RenderedEmail> {
    const brand = this.brandFor({ merchant });
    const merchantName = merchant.legalName;
    const appUrl = this.config.appPublicUrl;
    const supportEmail = this.eirms.seller.email || undefined;
    if (action === 'merchant.export.ready') {
      return {
        subject: `Your data export for ${merchantName} is ready`,
        html: await render(
          MerchantExportReadyEmail({
            brand,
            merchantName,
            ownerName: owner.name,
            invoiceCount: payload.invoiceCount,
            receiptCount: payload.receiptCount,
            inventoryCount: payload.inventoryCount,
            buyerCount: payload.buyerCount,
            fileSize: payload.fileSize,
            expiresAt: payload.expiresAt,
            downloadUrl: appUrl
              ? `${appUrl}/merchants/${merchant.id}/exports`
              : undefined,
          }),
        ),
      };
    }
    return {
      subject: `Your data export for ${merchantName} could not be completed`,
      html: await render(
        MerchantExportFailedEmail({
          brand,
          merchantName,
          ownerName: owner.name,
          supportEmail,
        }),
      ),
    };
  }

  async renderScheduledReport(input: {
    merchant: { legalName: string; email: string | null; phone: string | null };
    reportName: string;
    scopeLabel: string;
    windowLabel: string;
    skippedLabel?: string | null;
    rows: InfoRowData[];
    subject: string;
    attachmentNote?: string | null;
    truncatedNote?: string | null;
  }): Promise<RenderedEmail> {
    return {
      subject: input.subject,
      html: await render(
        ScheduledReportEmail({
          brand: this.brandFor({ merchant: input.merchant }),
          reportName: input.reportName,
          merchantName: input.merchant.legalName,
          scopeLabel: input.scopeLabel,
          windowLabel: input.windowLabel,
          skippedLabel: input.skippedLabel ?? null,
          rows: input.rows,
          attachmentNote: input.attachmentNote ?? null,
          truncatedNote: input.truncatedNote ?? null,
        }),
      ),
    };
  }
}

export interface PasswordResetRenderPayload {
  recipientName: string | null;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface ConsentRequestRenderPayload {
  recipientName: string | null;
  merchantName: string;
  requesterEmail: string;
  scopeLabels: string[];
  proposedDuration: string;
  decisionUrl: string;
  linkExpires: string;
}

export interface ExportRenderPayload {
  invoiceCount: number;
  receiptCount: number;
  inventoryCount: number;
  buyerCount: number;
  fileSize: string;
  expiresAt: string;
}

/** Subset of the Merchant row needed to render lifecycle emails. */
export type MerchantForEmail = {
  id: string;
  legalName: string;
  email: string | null;
  phone: string | null;
  rejectionReason: string | null;
};

/** EIRMS dates arrive as "DD-MM-YYYYTHH:mm:ss"; show just the date part. */
function dateOnly(value: string): string {
  return value.includes('T') ? value.split('T')[0] : value;
}

/** The original invoice IRN a memo references lives in the stored request
 *  payload under ReferenceDetails.RelatedDocument. */
function previousIrnOf(invoice: InvoiceForEmail): string {
  const req = invoice.rawRequest as {
    ReferenceDetails?: { RelatedDocument?: unknown };
  } | null;
  const related = req?.ReferenceDetails?.RelatedDocument;
  return typeof related === 'string' && related ? related : '—';
}
