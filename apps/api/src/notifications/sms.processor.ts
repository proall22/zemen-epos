import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Job } from 'bullmq';

import { publicInvoiceUrl } from '../common/public-link';
import { eirmsConfig } from '../eirms/eirms.config';
import { PrismaService } from '../prisma/prisma.service';
import { buyerPhoneFor } from './buyer-contact';
import { NotificationsI18nService } from './i18n';
import { resolveNotificationLanguage } from './locale';
import { notificationsConfig } from './notifications.config';
import { SMS_QUEUE, NotificationJob } from './notifications.types';
import { toGatewayMsisdn } from './phone';
import { buildInvoiceSms, buildReceiptSms } from './sms-message';
import { SmsClient } from './sms.client';

/**
 * Sends a buyer SMS per document event. Runs on its own queue, parallel to the
 * email worker, so a gateway failure retries the SMS without touching email.
 */
@Processor(SMS_QUEUE)
export class SmsProcessor extends WorkerHost {
  private readonly logger = new Logger(SmsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsClient,
    private readonly i18n: NotificationsI18nService,
    @Inject(notificationsConfig.KEY)
    private readonly config: ConfigType<typeof notificationsConfig>,
    @Inject(eirmsConfig.KEY)
    private readonly eirms: ConfigType<typeof eirmsConfig>,
  ) {
    super();
  }

  private get seller(): string {
    return this.eirms.seller.legalName;
  }

  /** Public QR image link, or undefined when the doc has no QR / no API URL. */
  private qrUrl(
    kind: 'invoices' | 'receipts',
    id: string,
    signedQR: string | null,
  ): string | undefined {
    return signedQR && this.config.apiPublicUrl
      ? `${this.config.apiPublicUrl}/${kind}/${id}/qr.png`
      : undefined;
  }

  async process(job: Job<NotificationJob>): Promise<void> {
    const data = job.data;
    // Merchant lifecycle is email-only — the operator's phone isn't on file
    // and SMS to the back-office about an onboarding event would be noise.
    // Acknowledge the job so it doesn't retry forever, and return.
    if (
      data.action === 'merchant.signup' ||
      data.action === 'merchant.approved' ||
      data.action === 'merchant.rejected' ||
      data.action === 'merchant.enabled' ||
      data.action === 'merchant.disabled' ||
      data.action === 'merchant.export.ready' ||
      data.action === 'merchant.export.failed' ||
      data.action === 'auth.password-reset' ||
      // Consent requests go to back-office/merchant admins by email only.
      data.action === 'consent.request'
    ) {
      return;
    }
    if (
      data.action === 'receipt.sales' ||
      data.action === 'receipt.withholding'
    ) {
      await this.handleReceipt(data);
      return;
    }
    await this.handleInvoice(data);
  }

  private async handleInvoice(
    data: Extract<NotificationJob, { invoiceId: string }>,
  ): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: data.invoiceId },
      include: { buyer: true, merchant: true },
    });
    if (!invoice) {
      this.logger.warn(`${data.action}: invoice ${data.invoiceId} not found`);
      return;
    }
    const to = toGatewayMsisdn(buyerPhoneFor(invoice));
    if (!to) {
      this.logger.debug(
        `${data.action}: no usable phone for invoice ${invoice.documentNumber}, skipping SMS`,
      );
      return;
    }
    const invoiceUrl = publicInvoiceUrl(
      this.config.appPublicUrl,
      invoice.id,
      this.config.publicLinkSecret,
    );
    const language = resolveNotificationLanguage({
      buyerLanguage: invoice.buyer.language,
      merchantDefaultLanguage: invoice.merchant.defaultLanguage,
    });
    await this.sms.send(
      to,
      await buildInvoiceSms(data.action, invoice, {
        seller: this.seller,
        invoiceUrl,
        language,
        i18n: this.i18n,
      }),
    );
  }

  private async handleReceipt(
    data: Extract<NotificationJob, { receiptId: string }>,
  ): Promise<void> {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: data.receiptId },
      include: {
        merchant: true,
        invoices: { include: { invoice: { include: { buyer: true } } } },
      },
    });
    if (!receipt) {
      this.logger.warn(`${data.action}: receipt ${data.receiptId} not found`);
      return;
    }
    // Withholding receipts are against an external supplier invoice — no buyer
    // phone on file — so they only carry an email/merchant copy, not an SMS.
    const firstInvoice = receipt.invoices[0]?.invoice ?? null;
    const phone =
      data.action === 'receipt.sales' && firstInvoice
        ? buyerPhoneFor(firstInvoice)
        : null;
    const to = toGatewayMsisdn(phone);
    if (!to) {
      this.logger.debug(
        `${data.action}: no usable phone for receipt ${receipt.receiptNumber}, skipping SMS`,
      );
      return;
    }
    const qrUrl = this.qrUrl('receipts', receipt.id, receipt.signedQR);
    const relatedIrn =
      data.action === 'receipt.sales'
        ? (receipt.invoices[0]?.invoice.irn ?? null)
        : receipt.externalInvoiceIrn;
    const language = resolveNotificationLanguage({
      buyerLanguage: firstInvoice?.buyer.language ?? null,
      merchantDefaultLanguage: receipt.merchant.defaultLanguage,
    });
    await this.sms.send(
      to,
      await buildReceiptSms(
        data.action,
        {
          receiptNumber: receipt.receiptNumber,
          collectedAmount: receipt.collectedAmount,
          withholdAmount: receipt.withholdAmount,
          receiptCurrency: receipt.receiptCurrency,
          rrn: receipt.rrn,
          relatedIrn,
        },
        {
          seller: this.seller,
          qrUrl,
          language,
          i18n: this.i18n,
        },
      ),
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<NotificationJob>, err: Error): void {
    this.logger.error(
      `SMS ${job.data.action} failed (attempt ${job.attemptsMade}): ${err.message}`,
    );
  }
}
