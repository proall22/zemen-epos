import { toGatewayMsisdn } from './phone';

describe('toGatewayMsisdn', () => {
  it('normalises the accepted shapes to 2519XXXXXXXX (no +)', () => {
    expect(toGatewayMsisdn('+251911223344')).toBe('251911223344'); // canonical
    expect(toGatewayMsisdn('+2510911223344')).toBe('251911223344'); // +25109…
    expect(toGatewayMsisdn('0911223344')).toBe('251911223344'); // 09…
    expect(toGatewayMsisdn('251911223344')).toBe('251911223344'); // 2519…
    expect(toGatewayMsisdn('911223344')).toBe('251911223344'); // 9… (as stored)
    expect(toGatewayMsisdn(' 0911223344 ')).toBe('251911223344'); // trimmed
  });

  it('rejects non-mobile / malformed numbers (matches provider normaliser)', () => {
    expect(toGatewayMsisdn(null)).toBeNull();
    expect(toGatewayMsisdn('')).toBeNull();
    expect(toGatewayMsisdn('123')).toBeNull();
    expect(toGatewayMsisdn('0811223344')).toBeNull(); // not a 09 mobile
    expect(toGatewayMsisdn('0712345678')).toBeNull(); // Safaricom 07 not supported
    expect(toGatewayMsisdn('0911 223 344')).toBeNull(); // internal spaces
    expect(toGatewayMsisdn('09112233')).toBeNull(); // too short
  });
});
