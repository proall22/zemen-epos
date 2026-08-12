import { ipInRanges, parseCidrList } from './ip-cidr';

describe('ip-cidr', () => {
  it('parses valid v4 CIDR + bare v4', () => {
    const { ranges, errors } = parseCidrList('10.0.0.0/8, 1.2.3.4');
    expect(errors).toEqual([]);
    expect(ranges).toHaveLength(2);
    expect(ranges[1].bits).toBe(32);
  });

  it('parses valid v6 CIDR', () => {
    const { ranges, errors } = parseCidrList('2001:db8::/32');
    expect(errors).toEqual([]);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].bits).toBe(32);
  });

  it('collects invalid entries without throwing', () => {
    const { ranges, errors } = parseCidrList('bogus,10.0.0.0/8,not-an-ip');
    expect(ranges).toHaveLength(1);
    expect(errors).toHaveLength(2);
  });

  it('matches v4 in v4 CIDR', () => {
    const { ranges } = parseCidrList('10.0.0.0/8');
    expect(ipInRanges('10.5.5.5', ranges)).toBe(true);
    expect(ipInRanges('11.0.0.0', ranges)).toBe(false);
  });

  it('matches bare v4 as /32', () => {
    const { ranges } = parseCidrList('192.168.1.1');
    expect(ipInRanges('192.168.1.1', ranges)).toBe(true);
    expect(ipInRanges('192.168.1.2', ranges)).toBe(false);
  });

  it('unwraps IPv4-mapped v6 (::ffff:1.2.3.4) for matching', () => {
    const { ranges } = parseCidrList('1.2.3.0/24');
    expect(ipInRanges('::ffff:1.2.3.4', ranges)).toBe(true);
  });

  it('returns false for garbage inputs, never throws', () => {
    const { ranges } = parseCidrList('10.0.0.0/8');
    expect(ipInRanges('not-an-ip', ranges)).toBe(false);
    expect(ipInRanges('', ranges)).toBe(false);
  });

  it('empty range list never matches', () => {
    expect(ipInRanges('1.2.3.4', [])).toBe(false);
  });
});
