import * as ipaddr from 'ipaddr.js';

export interface CidrRange {
  addr: ipaddr.IPv4 | ipaddr.IPv6;
  bits: number;
}

/** Parse a comma-separated list of CIDR ranges (or single IPs, which we
 *  treat as `/32` for v4, `/128` for v6). Invalid entries are skipped and
 *  returned via `errors` so the boot logger can surface them. */
export function parseCidrList(raw: string | undefined | null): {
  ranges: CidrRange[];
  errors: string[];
} {
  const ranges: CidrRange[] = [];
  const errors: string[] = [];
  if (!raw) return { ranges, errors };

  for (const rawEntry of raw.split(',')) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    try {
      if (entry.includes('/')) {
        const parsed = ipaddr.parseCIDR(entry);
        ranges.push({ addr: parsed[0], bits: parsed[1] });
      } else {
        const addr = ipaddr.parse(entry);
        const bits = addr.kind() === 'ipv6' ? 128 : 32;
        ranges.push({ addr, bits });
      }
    } catch (err) {
      errors.push(`${entry}: ${(err as Error).message}`);
    }
  }
  return { ranges, errors };
}

/** Check if `ip` matches any range in `ranges`. IPv4-mapped v6 addresses
 *  (::ffff:1.2.3.4) are unwrapped to their v4 form before matching so a
 *  proxy that only speaks v6 to Node doesn't need duplicate rules. */
export function ipInRanges(ip: string, ranges: CidrRange[]): boolean {
  if (ranges.length === 0) return false;
  let addr: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    addr = ipaddr.parse(ip);
  } catch {
    return false;
  }
  if (addr.kind() === 'ipv6' && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
    addr = (addr as ipaddr.IPv6).toIPv4Address();
  }
  const kind = addr.kind();
  for (const range of ranges) {
    if (range.addr.kind() !== kind) continue;
    if (addr.match(range.addr as never, range.bits)) return true;
  }
  return false;
}
