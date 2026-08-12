import { resolveRecipients } from './recipients';

describe('resolveRecipients', () => {
  const merchant = ['ops@e-pay.et'];

  it('sends to the buyer and BCCs the merchant copy', () => {
    expect(resolveRecipients('buyer@acme.et', merchant)).toEqual({
      to: ['buyer@acme.et'],
      bcc: merchant,
    });
  });

  it('omits bcc when there is no merchant copy', () => {
    expect(resolveRecipients('buyer@acme.et', [])).toEqual({
      to: ['buyer@acme.et'],
      bcc: undefined,
    });
  });

  it('falls back to the merchant copy as the primary recipient', () => {
    expect(resolveRecipients(null, merchant)).toEqual({ to: merchant });
    expect(resolveRecipients('   ', merchant)).toEqual({ to: merchant });
  });

  it('returns null when there is nobody to notify', () => {
    expect(resolveRecipients(null, [])).toBeNull();
    expect(resolveRecipients(undefined, [])).toBeNull();
  });
});
