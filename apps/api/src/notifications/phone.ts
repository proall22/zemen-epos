/**
 * Canonical +2519XXXXXXXX form, mirroring the SMS provider's own normaliser so
 * we accept/reject exactly what their gateway is provisioned for (Ethio Telecom
 * 9-prefix mobiles only). Returns null for anything else.
 */
function normalizeEthiopianPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const p = raw.trim();
  if (/^\+2519[0-9]{8}$/.test(p)) return p; // +2519XXXXXXXX (already canonical)
  if (/^\+25109[0-9]{8}$/.test(p)) return '+251' + p.slice(5); // +25109XXXXXXXX
  if (/^09[0-9]{8}$/.test(p)) return '+2519' + p.slice(2); // 09XXXXXXXX
  if (/^2519[0-9]{8}$/.test(p)) return '+2519' + p.slice(4); // 2519XXXXXXXX
  if (/^9[0-9]{8}$/.test(p)) return '+2519' + p.slice(1); // 9XXXXXXXX
  return null;
}

/**
 * The EchoWave gateway's `to` field wants intl format without the '+', e.g.
 * 0911223344 → 251911223344. Normalise to canonical form, then drop the '+'.
 * Returns null when the number isn't a routable ET mobile (caller skips SMS).
 */
export function toGatewayMsisdn(raw: string | null | undefined): string | null {
  const canonical = normalizeEthiopianPhone(raw);
  return canonical ? canonical.slice(1) : null;
}
