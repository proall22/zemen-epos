/**
 * Map an EIRMS endpoint path to a stable audit action label:
 *   '/v1/register'          → 'eirms.register'
 *   '/v1/receipt/sales'     → 'eirms.receipt.sales'
 *   '/auth/login'           → 'eirms.auth.login'
 */
export function eirmsAction(path: string): string {
  const slug = path
    .replace(/^\/+/, '')
    .replace(/^v1\//, '')
    .replace(/\//g, '.');
  return `eirms.${slug || 'call'}`;
}
