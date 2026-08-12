import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Job } from 'bullmq';

import {
  consentScopeLabels,
  formatConsentDuration,
} from '../consent/consent.constants';
import { PrismaService } from '../prisma/prisma.service';
import { buyerEmailFor } from './buyer-contact';
import { EmailRenderer } from './email-renderer';
import { resolveNotificationLanguage } from './locale';
import { notificationsConfig } from './notifications.config';
import { NOTIFICATIONS_QUEUE, NotificationJob } from './notifications.types';
import { resolveRecipients } from './recipients';
import { ResendClient } from './resend.client';

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: EmailRenderer,
    private readonly resend: ResendClient,
    @Inject(notificationsConfig.KEY)
    private readonly config: ConfigType<typeof notificationsConfig>,
  ) {
    super();
  }

  async process(job: Job<NotificationJob>): Promise<void> {
    const data = job.data;
    if (data.action === 'auth.password-reset') {
      await this.handlePasswordReset(data);
      return;
    }
    if (data.action === 'consent.request') {
      await this.handleConsentRequest(data);
      return;
    }
    if (
      data.action === 'merchant.export.ready' ||
      data.action === 'merchant.export.failed'
    ) {
      await this.handleExport(data);
      return;
    }
    if (
      data.action === 'merchant.signup' ||
      data.action === 'merchant.approved' ||
      data.action === 'merchant.rejected' ||
      data.action === 'merchant.enabled' ||
      data.action === 'merchant.disabled'
    ) {
      await this.handleMerchant(data);
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
      include: { buyer: true, cancellation: true, merchant: true },
    });
    if (!invoice) {
      this.logger.warn(`${data.action}: invoice ${data.invoiceId} not found`);
      return;
    }

    const recipients = resolveRecipients(
      buyerEmailFor(invoice),
      this.config.merchantCopy,
    );
    if (!recipients) {
      this.logger.debug(
        `${data.action}: no recipients for invoice ${invoice.documentNumber}, skipping`,
      );
      return;
    }

    const language = resolveNotificationLanguage({
      buyerLanguage: invoice.buyer.language,
      merchantDefaultLanguage: invoice.merchant.defaultLanguage,
    });
    const rendered = await this.renderer.renderInvoice(
      data.action,
      invoice,
      language,
    );
    await this.send(recipients, rendered);
  }

  private async handleReceipt(
    data: Extract<NotificationJob, { receiptId: string }>,
  ): Promise<void> {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: data.receiptId },
      include: {
        invoices: { include: { invoice: { include: { buyer: true } } } },
        merchant: true,
      },
    });
    if (!receipt) {
      this.logger.warn(`${data.action}: receipt ${data.receiptId} not found`);
      return;
    }

    const firstInvoice = receipt.invoices[0]?.invoice ?? null;
    const buyerEmail =
      data.action === 'receipt.sales' && firstInvoice
        ? buyerEmailFor(firstInvoice)
        : null;
    const recipients = resolveRecipients(buyerEmail, this.config.merchantCopy);
    if (!recipients) {
      this.logger.debug(
        `${data.action}: no recipients for receipt ${receipt.receiptNumber}, skipping`,
      );
      return;
    }

    const language = resolveNotificationLanguage({
      buyerLanguage: firstInvoice?.buyer.language ?? null,
      merchantDefaultLanguage: receipt.merchant.defaultLanguage,
    });
    const rendered = await this.renderer.renderReceipt(
      data.action,
      receipt,
      language,
    );
    await this.send(recipients, rendered);
  }

  /**
   * Merchant lifecycle email — owner-facing. Looks up the merchant + finds
   * its owner via the first MERCHANT_ADMIN user under it (signup creates
   * exactly one), falling back to the merchant's contact email when no
   * owner row is found (defensive — shouldn't happen post-signup).
   */
  private async handleMerchant(
    data: Extract<NotificationJob, { merchantId: string }>,
  ): Promise<void> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: data.merchantId },
    });
    if (!merchant) {
      this.logger.warn(`${data.action}: merchant ${data.merchantId} not found`);
      return;
    }
    const owner = await this.prisma.user.findFirst({
      where: { merchantId: merchant.id, role: 'MERCHANT_ADMIN' },
      orderBy: { createdAt: 'asc' },
      select: { email: true, name: true },
    });

    const ownerEmail = owner?.email ?? merchant.email ?? null;
    const recipients = resolveRecipients(ownerEmail, this.config.merchantCopy);
    if (!recipients) {
      this.logger.debug(
        `${data.action}: no recipient for merchant ${merchant.legalName}, skipping`,
      );
      return;
    }

    const rendered = await this.renderer.renderMerchant(data.action, merchant, {
      name: owner?.name ?? null,
    });
    await this.send(recipients, rendered);
  }

  private async handleExport(
    data: Extract<NotificationJob, { exportId: string }>,
  ): Promise<void> {
    const row = await this.prisma.merchantExport.findUnique({
      where: { id: data.exportId },
      include: { merchant: true },
    });
    if (!row) {
      this.logger.warn(`${data.action}: export ${data.exportId} not found`);
      return;
    }
    const owner = await this.prisma.user.findFirst({
      where: { merchantId: row.merchantId, role: 'MERCHANT_ADMIN' },
      orderBy: { createdAt: 'asc' },
      select: { email: true, name: true },
    });
    const ownerEmail = owner?.email ?? row.merchant.email ?? null;
    const recipients = resolveRecipients(ownerEmail, this.config.merchantCopy);
    if (!recipients) {
      this.logger.debug(
        `${data.action}: no recipient for export ${row.id}, skipping`,
      );
      return;
    }
    const rendered = await this.renderer.renderExport(
      data.action,
      row.merchant,
      { name: owner?.name ?? null },
      {
        invoiceCount: row.invoiceCount,
        receiptCount: row.receiptCount,
        inventoryCount: row.inventoryCount,
        buyerCount: row.buyerCount,
        fileSize: humanBytes(row.fileBytes ?? 0),
        expiresAt: row.expiresAt
          ? row.expiresAt.toISOString().slice(0, 10)
          : 'soon',
      },
    );
    await this.send(recipients, rendered);
  }

  private async handlePasswordReset(
    data: Extract<NotificationJob, { action: 'auth.password-reset' }>,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, email: true, name: true, active: true },
    });
    if (!user || !user.active) {
      this.logger.warn(
        `password-reset: user ${data.userId} missing or inactive`,
      );
      return;
    }
    const appUrl = this.config.appPublicUrl;
    if (!appUrl) {
      this.logger.error(
        'APP_PUBLIC_URL is unset — cannot build password-reset link.',
      );
      return;
    }
    const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(
      data.rawToken,
    )}`;
    const rendered = await this.renderer.renderPasswordReset({
      recipientName: user.name,
      resetUrl,
      expiresInMinutes: 30,
    });
    await this.send({ to: [user.email] }, rendered);
  }

  private async handleConsentRequest(
    data: Extract<NotificationJob, { action: 'consent.request' }>,
  ): Promise<void> {
    const grant = await this.prisma.consentGrant.findUnique({
      where: { id: data.grantId },
      include: {
        merchant: { select: { legalName: true } },
        superAdmin: { select: { email: true } },
      },
    });
    if (!grant) {
      this.logger.warn(`consent.request: grant ${data.grantId} not found`);
      return;
    }
    // Stale/decided grants shouldn't email — a retry of an old job is a no-op.
    if (grant.status !== 'PENDING' || grant.linkExpiresAt < new Date()) {
      this.logger.debug(
        `consent.request: grant ${grant.id} no longer actionable (${grant.status})`,
      );
      return;
    }
    const admins = await this.prisma.user.findMany({
      where: {
        merchantId: grant.merchantId,
        role: 'MERCHANT_ADMIN',
        active: true,
      },
      select: { email: true },
    });
    const emails = admins.map((a) => a.email).filter(Boolean);
    if (emails.length === 0) {
      this.logger.warn(
        `consent.request: merchant ${grant.merchantId} has no active admin to notify`,
      );
      return;
    }
    const appUrl = this.config.appPublicUrl;
    if (!appUrl) {
      this.logger.error(
        'APP_PUBLIC_URL is unset — cannot build consent decision link.',
      );
      return;
    }
    const decisionUrl = `${appUrl}/consent/${encodeURIComponent(data.rawToken)}`;
    const rendered = await this.renderer.renderConsentRequest({
      recipientName: null,
      merchantName: grant.merchant.legalName,
      requesterEmail: grant.superAdmin.email,
      scopeLabels: consentScopeLabels(grant.scopes),
      proposedDuration: formatConsentDuration(grant.proposedMinutes),
      decisionUrl,
      linkExpires: grant.linkExpiresAt.toISOString().slice(0, 16).replace('T', ' '),
    });
    await this.send({ to: emails }, rendered);
  }

  private async send(
    recipients: { to: string[]; bcc?: string[] },
    rendered: { subject: string; html: string },
  ): Promise<void> {
    await this.resend.send({
      to: recipients.to,
      bcc: recipients.bcc,
      subject: rendered.subject,
      html: rendered.html,
    });
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<NotificationJob>, err: Error): void {
    this.logger.error(
      `Notification ${job.data.action} failed (attempt ${job.attemptsMade}): ${err.message}`,
    );
  }
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}
