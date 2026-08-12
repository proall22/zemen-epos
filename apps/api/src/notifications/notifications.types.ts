export const NOTIFICATIONS_QUEUE = 'notifications';
/** SMS rides a separate queue so its retries never re-trigger an email send. */
export const SMS_QUEUE = 'sms-notifications';

/**
 * A queued notification carries only the entity id + action; the worker
 * re-loads the record from the DB so the email always renders current state.
 */
export type NotificationJob =
  | { action: 'invoice.registered'; invoiceId: string }
  | { action: 'invoice.cancelled'; invoiceId: string }
  | { action: 'memo.credit'; invoiceId: string }
  | { action: 'memo.debit'; invoiceId: string }
  | { action: 'receipt.sales'; receiptId: string }
  | { action: 'receipt.withholding'; receiptId: string }
  // Merchant lifecycle — emails the merchant owner (their User.email).
  | { action: 'merchant.signup'; merchantId: string }
  | { action: 'merchant.approved'; merchantId: string }
  | { action: 'merchant.rejected'; merchantId: string }
  // Sent when a previously-approved merchant has its active flag flipped
  // by a back-office admin. Disable pauses everything; enable restores it.
  | { action: 'merchant.enabled'; merchantId: string }
  | { action: 'merchant.disabled'; merchantId: string }
  | { action: 'merchant.export.ready'; exportId: string }
  | { action: 'merchant.export.failed'; exportId: string }
  // Password reset — `rawToken` is carried in-queue so the worker can build
  // the reset URL without re-hashing. Keep it out of audit / external logs.
  | { action: 'auth.password-reset'; userId: string; rawToken: string }
  // Cross-tenant consent request — emails every active MERCHANT_ADMIN of the
  // target merchant a magic link. `rawToken` builds the decision URL; keep it
  // out of audit / external logs, same as the reset token.
  | { action: 'consent.request'; grantId: string; rawToken: string };

export type NotificationAction = NotificationJob['action'];

/** Stable per-entity job id so retries of the same action don't double-send.
 *  BullMQ forbids ':' in custom job ids (it namespaces Redis keys with it), so
 *  use '__' as the separator. */
export function notificationJobId(job: NotificationJob): string {
  const entityId =
    'invoiceId' in job
      ? job.invoiceId
      : 'receiptId' in job
        ? job.receiptId
        : 'exportId' in job
          ? job.exportId
          : 'grantId' in job
            ? job.grantId
            : 'userId' in job
              ? job.userId
              : job.merchantId;
  return `${job.action}__${entityId}`;
}
