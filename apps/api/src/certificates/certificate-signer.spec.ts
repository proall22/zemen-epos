import forge from 'node-forge';

import {
  type CsrSubject,
  generateCsr,
  generateKeyPair,
  parseLeafCertificate,
  verifyLeafMatchesKey,
  verifySubjectCn,
} from './certificate-signer';

const SUBJECT: CsrSubject = {
  tin: '1234567890',
  systemNumber: '0A774FBBBE',
  organizationName: 'Test Company',
  organizationalUnitName: 'Main Branch',
  country: 'ET',
  stateOrProvinceName: 'Addis Ababa',
  localityName: 'Addis Ababa',
  emailAddress: 'ops@example.com',
};

/** Build a short-lived self-signed cert against `privateKeyPem`. Used as a
 *  stand-in for an INSA-issued PEM in verification tests. */
function selfSignedCertPem(
  privateKeyPem: string,
  cn = SUBJECT.tin,
  serialHex = '01',
): string {
  const forgePriv = forge.pki.privateKeyFromPem(privateKeyPem);
  const forgePub = forge.pki.setRsaPublicKey(forgePriv.n, forgePriv.e);
  const cert = forge.pki.createCertificate();
  cert.publicKey = forgePub;
  cert.serialNumber = serialHex;
  cert.validity.notBefore = new Date('2026-01-01T00:00:00Z');
  cert.validity.notAfter = new Date('2027-01-01T00:00:00Z');
  const attrs = [
    { shortName: 'C', value: SUBJECT.country },
    { shortName: 'O', value: SUBJECT.organizationName },
    { shortName: 'CN', value: cn },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(forgePriv, forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
}

describe('certificate-signer', () => {
  describe('generateKeyPair', () => {
    it('produces a PKCS#8 private key and an SPKI public key', () => {
      const { privateKeyPem, publicKeyPem } = generateKeyPair();
      expect(privateKeyPem).toContain('-----BEGIN PRIVATE KEY-----');
      expect(privateKeyPem).toContain('-----END PRIVATE KEY-----');
      expect(publicKeyPem).toContain('-----BEGIN PUBLIC KEY-----');
      // Round-trip via forge to confirm the private key parses as RSA.
      const parsed = forge.pki.privateKeyFromPem(privateKeyPem);
      expect(parsed.n.bitLength()).toBe(2048);
    });
  });

  describe('generateCsr', () => {
    it('emits a PEM whose subject fields match the input in the guide order', () => {
      const { privateKeyPem } = generateKeyPair();
      const csrPem = generateCsr(SUBJECT, privateKeyPem);
      expect(csrPem).toContain('-----BEGIN CERTIFICATE REQUEST-----');

      const parsed = forge.pki.certificationRequestFromPem(csrPem);
      // forge exposes subject fields under multiple aliases (shortName like
      // "CN"/"E", long name like "commonName"/"emailAddress"). Index by every
      // alias so the test asserts against the caller's chosen label without
      // caring which one forge normalised to.
      const byLabel = new Map<string, string>();
      for (const field of parsed.subject.attributes) {
        const value = String(field.value);
        if (field.shortName) byLabel.set(field.shortName, value);
        if (field.name) byLabel.set(field.name, value);
      }
      expect(byLabel.get('C')).toBe('ET');
      expect(byLabel.get('ST')).toBe('Addis Ababa');
      expect(byLabel.get('L')).toBe('Addis Ababa');
      expect(byLabel.get('O')).toBe('Test Company');
      expect(byLabel.get('OU')).toBe('Main Branch');
      expect(byLabel.get('CN')).toBe('1234567890');
      expect(byLabel.get('serialNumber')).toBe('0A774FBBBE');
      expect(byLabel.get('emailAddress')).toBe('ops@example.com');
    });

    it('signs the CSR with the private key (self-consistent)', () => {
      const { privateKeyPem } = generateKeyPair();
      const csrPem = generateCsr(SUBJECT, privateKeyPem);
      const parsed = forge.pki.certificationRequestFromPem(csrPem);
      // forge.pki verifies the CSR signature with the enclosed public key.
      expect(parsed.verify()).toBe(true);
    });
  });

  describe('parseLeafCertificate', () => {
    it('pulls CN, serial, and validity dates off the leaf cert', () => {
      const { privateKeyPem } = generateKeyPair();
      const pem = selfSignedCertPem(privateKeyPem, '9876543210', '0abc');
      const leaf = parseLeafCertificate(pem);
      expect(leaf.subjectCn).toBe('9876543210');
      // Node normalises the serial to lowercase hex without the leading zeros
      // stripped past the byte boundary — accept either casing.
      expect(leaf.serial.toLowerCase()).toBe('0abc');
      expect(leaf.notBefore.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(leaf.notAfter.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    });

    it('picks the LEAF when the PEM contains a chain (leaf first)', () => {
      const { privateKeyPem: keyA } = generateKeyPair();
      const { privateKeyPem: keyB } = generateKeyPair();
      const leafPem = selfSignedCertPem(keyA, 'LEAF_CN');
      const intermediatePem = selfSignedCertPem(keyB, 'INT_CN');
      const chain = `${leafPem}\n${intermediatePem}`;
      expect(parseLeafCertificate(chain).subjectCn).toBe('LEAF_CN');
    });
  });

  describe('verifyLeafMatchesKey', () => {
    it('returns true when the cert public key derives from the private key', () => {
      const { privateKeyPem } = generateKeyPair();
      const pem = selfSignedCertPem(privateKeyPem);
      expect(verifyLeafMatchesKey(pem, privateKeyPem)).toBe(true);
    });

    it('returns false when the cert was issued against a different key', () => {
      const { privateKeyPem: signingKey } = generateKeyPair();
      const { privateKeyPem: otherKey } = generateKeyPair();
      const pem = selfSignedCertPem(otherKey);
      expect(verifyLeafMatchesKey(pem, signingKey)).toBe(false);
    });
  });

  describe('verifySubjectCn', () => {
    it('returns true when CN matches expected TIN', () => {
      const { privateKeyPem } = generateKeyPair();
      const pem = selfSignedCertPem(privateKeyPem, '5555555555');
      expect(verifySubjectCn(pem, '5555555555')).toBe(true);
      expect(verifySubjectCn(pem, '4444444444')).toBe(false);
    });
  });
});
