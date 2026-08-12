import {
  X509Certificate,
  createVerify,
  generateKeyPairSync,
} from 'node:crypto';

import { canonicalRequest, signEnvelope } from './eirms-signer';
import {
  SAMPLE_CERTIFICATE_B64,
  SAMPLE_REQUEST,
  SAMPLE_SIGNATURE_B64,
} from './eirms-signer.fixture';

/** Pull the leaf cert (first PEM block) out of the INSA cert file. */
function leafPublicKey(certFileB64: string) {
  const file = Buffer.from(certFileB64, 'base64').toString('utf-8');
  const pem = file.match(
    /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/,
  );
  if (!pem) throw new Error('no PEM cert in fixture');
  return new X509Certificate(pem[0]).publicKey;
}

describe('eirms-signer — contract locked to a real MoR sample', () => {
  it('the real sample signature verifies over JSON.stringify(request) with RSA-SHA512', () => {
    const ok = createVerify('RSA-SHA512')
      .update(canonicalRequest(SAMPLE_REQUEST), 'utf-8')
      .verify(
        leafPublicKey(SAMPLE_CERTIFICATE_B64),
        Buffer.from(SAMPLE_SIGNATURE_B64, 'base64'),
      );
    expect(ok).toBe(true);
  });

  it('rejects the wrong algorithm (guards against an accidental SHA256 regression)', () => {
    const ok = createVerify('RSA-SHA256')
      .update(canonicalRequest(SAMPLE_REQUEST), 'utf-8')
      .verify(
        leafPublicKey(SAMPLE_CERTIFICATE_B64),
        Buffer.from(SAMPLE_SIGNATURE_B64, 'base64'),
      );
    expect(ok).toBe(false);
  });
});

describe('signEnvelope', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const privateKeyPem = privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();
  const certificateFile =
    'Subject: CN=test\n-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n';

  it('produces an envelope whose signature verifies over the request JSON', () => {
    const body = { clientId: 'a', tin: '123', nested: { x: 1 } };
    const env = signEnvelope(body, { privateKeyPem, certificateFile });

    expect(env.request).toBe(body);
    const ok = createVerify('RSA-SHA512')
      .update(canonicalRequest(body), 'utf-8')
      .verify(publicKey, Buffer.from(env.signature, 'base64'));
    expect(ok).toBe(true);
  });

  it('base64-encodes the certificate file verbatim', () => {
    const env = signEnvelope({}, { privateKeyPem, certificateFile });
    expect(Buffer.from(env.certificate, 'base64').toString('utf-8')).toBe(
      certificateFile,
    );
  });

  // Faithful to the MoR signing guide's invoice example: full nested payload
  // with arrays, explicit nulls, and unquoted numbers. Proves our serialization
  // matches MoR's documented compact "Parsed String to be signed".
  it('serializes a full invoice payload to the documented compact form', () => {
    const invoice = {
      BuyerDetails: { City: '0', Tin: '0999930000', VatNumber: '123475885858' },
      DocumentDetails: { DocumentNumber: '1', Date: '21-03-2025T00:00:00', Type: 'INV' },
      ItemList: [
        { Discount: 0, HarmonizationCode: null, PreTaxValue: 1000, LineNumber: 1 },
        { Discount: 0, HarmonizationCode: null, PreTaxValue: 10000, LineNumber: 2 },
      ],
      ReferenceDetails: { PreviousIrn: 'abc', RelatedDocument: null },
      SourceSystem: { InvoiceCounter: 1, SystemType: 'POS' },
      Version: '1',
    };
    const s = canonicalRequest(invoice);
    expect(s).not.toMatch(/: |\n|\t/); // compact — no whitespace
    expect(s).toContain('"HarmonizationCode":null'); // nulls preserved
    expect(s).toContain('"RelatedDocument":null');
    expect(s).toContain('"PreTaxValue":1000'); // numbers unquoted
    expect(s).toContain('"InvoiceCounter":1');

    const env = signEnvelope(invoice, { privateKeyPem, certificateFile });
    const ok = createVerify('RSA-SHA512')
      .update(s, 'utf-8')
      .verify(publicKey, Buffer.from(env.signature, 'base64'));
    expect(ok).toBe(true);
  });
});
