import { redactForAudit, sanitiseBody } from './audit-redact';

describe('redactForAudit', () => {
  it('redacts sensitive keys at any depth, including arrays', () => {
    const input = {
      password: 'secret',
      nested: { token: 'abc', clientSecret: 's', ok: 1 },
      list: [{ apikey: 'k', name: 'fine' }],
      Authorization: 'Bearer x',
    };
    expect(redactForAudit(input)).toEqual({
      password: '[redacted]',
      nested: { token: '[redacted]', clientSecret: '[redacted]', ok: 1 },
      list: [{ apikey: '[redacted]', name: 'fine' }],
      Authorization: '[redacted]',
    });
  });

  it('passes non-sensitive data through unchanged', () => {
    expect(redactForAudit({ a: 1, b: 'x', c: [1, 2] })).toEqual({
      a: 1,
      b: 'x',
      c: [1, 2],
    });
  });
});

describe('sanitiseBody', () => {
  it('replaces payloads over the size cap with a marker', () => {
    const big: Record<string, string> = {};
    for (let i = 0; i < 60; i++) big[`f${i}`] = 'y'.repeat(4000);
    const out = sanitiseBody(big) as { _truncated?: boolean };
    expect(out._truncated).toBe(true);
  });

  it('still redacts within the cap', () => {
    expect(sanitiseBody({ password: 'p', ok: true })).toEqual({
      password: '[redacted]',
      ok: true,
    });
  });
});
