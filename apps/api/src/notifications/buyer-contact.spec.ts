import { buyerEmailFor, buyerPhoneFor } from './buyer-contact';

const raw = { BuyerDetails: { Email: 'buyer@acme.et', Phone: '0911000111' } };

describe('buyerEmailFor / buyerPhoneFor', () => {
  it('returns the joined buyer contact for non-walk-in', () => {
    const inv = {
      rawRequest: raw,
      buyer: { tin: '0999930000', email: 'row@acme.et', phone: '0900000000' },
    };
    expect(buyerEmailFor(inv)).toBe('row@acme.et');
    expect(buyerPhoneFor(inv)).toBe('0900000000');
  });

  it('reads captured contact from rawRequest for walk-in', () => {
    const inv = {
      rawRequest: raw,
      buyer: { tin: 'WALKIN', email: null, phone: null },
    };
    expect(buyerEmailFor(inv)).toBe('buyer@acme.et');
    expect(buyerPhoneFor(inv)).toBe('0911000111');
  });

  it('returns null when walk-in has no captured contact', () => {
    const inv = {
      rawRequest: { BuyerDetails: {} },
      buyer: { tin: 'WALKIN', email: null, phone: null },
    };
    expect(buyerEmailFor(inv)).toBeNull();
    expect(buyerPhoneFor(inv)).toBeNull();
  });

  it('trims whitespace and rejects blank strings', () => {
    const inv = {
      rawRequest: { BuyerDetails: { Email: '  x@y.z  ', Phone: '   ' } },
      buyer: { tin: 'WALKIN', email: null, phone: null },
    };
    expect(buyerEmailFor(inv)).toBe('x@y.z');
    expect(buyerPhoneFor(inv)).toBeNull();
  });
});
