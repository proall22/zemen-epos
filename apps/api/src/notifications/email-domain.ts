/**
 * Consumer inboxes we don't need to track per-domain: they're huge, their
 * deliverability signal is dominated by their sheer volume, and per-domain
 * alerting on them creates noise more than insight. Bounces on these still
 * get persisted — we just don't compute the "domain X is failing" alert.
 */
const CONSUMER_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
]);

/** Best-effort domain extraction; returns lowercased domain or `null` when
 *  the address is unparseable. */
export function domainOf(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase() || null;
}

/** True for common consumer mailbox providers. Corporate domains return
 *  false and get first-class per-domain observability. */
export function isConsumerDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  return CONSUMER_DOMAINS.has(domain);
}
