import {
  X509Certificate,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from 'node:crypto';

import forge from 'node-forge';

/**
 * Pure functions used by the certificate onboarding flow:
 *
 *   generateKeyPair()          →  fresh RSA-2048 keypair (PKCS#8 PEM).
 *   generateCsr(subject, pk)   →  PEM-encoded CSR matching INSA's guide §3.2.
 *   parseLeafCertificate(pem)  →  non-secret bits we display in the UI.
 *   verifyLeafMatchesKey(...)  →  the pubkey inside the cert matches our
 *                                 private key — i.e. this is the cert INSA
 *                                 issued against OUR CSR.
 *   verifySubjectCn(cert, cn)  →  leaf CN equals the expected TIN.
 *
 * These are pure so the higher-level CertificatesService stays focused on
 * DB / Vault orchestration and can be unit-tested with jest without any I/O.
 */

export interface KeyPairPem {
  privateKeyPem: string;
  publicKeyPem: string;
}

export interface CsrSubject {
  /** CN = taxpayer TIN. Guide §3.2. */
  tin: string;
  /** X.500 serialNumber = branch system number. */
  systemNumber: string;
  organizationName: string;
  /** Establishment / branch name — guide allows main organization as fallback. */
  organizationalUnitName: string;
  /** ISO country code. Guide hard-codes "ET"; we still take it as input for
   *  future flexibility. */
  country: string;
  /** Guide hard-codes "Addis Ababa" for both. */
  stateOrProvinceName: string;
  localityName: string;
  emailAddress: string;
}

export interface LeafCertificate {
  subjectCn: string;
  serial: string;
  notBefore: Date;
  notAfter: Date;
}

/** RSA-2048 keypair as PKCS#8 / SPKI PEMs. Guide §3.1 specifies 2048-bit RSA. */
export function generateKeyPair(): KeyPairPem {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  return {
    privateKeyPem: privateKey
      .export({ format: 'pem', type: 'pkcs8' })
      .toString(),
    publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
  };
}

/**
 * Build a PEM-encoded CSR whose fields match `openssl req -new -config
 * einvoice.cnf` from the guideline exactly. Subject fields are ordered per
 * the PDF sample: C, ST, L, O, OU, CN, serialNumber, emailAddress. INSA
 * checks CN + serialNumber against their taxpayer registry; the rest is
 * informational.
 *
 * Signature algorithm on the CSR body itself is SHA-256 (openssl's default,
 * matching what the sample CSR produced with `openssl req -new` would sign
 * with). This is unrelated to the API request-signing algorithm
 * (SHA512withRSA — see eirms-signer.ts).
 */
export function generateCsr(
  subject: CsrSubject,
  privateKeyPem: string,
): string {
  const forgePrivateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const forgePublicKey = forge.pki.setRsaPublicKey(
    forgePrivateKey.n,
    forgePrivateKey.e,
  );

  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = forgePublicKey;
  csr.setSubject([
    { shortName: 'C', value: subject.country },
    { shortName: 'ST', value: subject.stateOrProvinceName },
    { shortName: 'L', value: subject.localityName },
    { shortName: 'O', value: subject.organizationName },
    { shortName: 'OU', value: subject.organizationalUnitName },
    { shortName: 'CN', value: subject.tin },
    { name: 'serialNumber', value: subject.systemNumber },
    { name: 'emailAddress', value: subject.emailAddress },
  ]);
  csr.sign(forgePrivateKey, forge.md.sha256.create());

  return forge.pki.certificationRequestToPem(csr);
}

/** Extract the display fields from the first CERTIFICATE block in `pem`. INSA
 *  returns leaf first, followed by the intermediate + root — Node's X509
 *  constructor stops at the first cert, which is exactly what we want. */
export function parseLeafCertificate(pem: string): LeafCertificate {
  const cert = new X509Certificate(pem);
  return {
    subjectCn: extractCn(cert.subject),
    serial: cert.serialNumber,
    notBefore: new Date(cert.validFrom),
    notAfter: new Date(cert.validTo),
  };
}

/** True iff the leaf cert's public key matches the private key. The check is
 *  done on SPKI DER bytes so the comparison ignores PEM header whitespace and
 *  line-ending drift. */
export function verifyLeafMatchesKey(
  certPem: string,
  privateKeyPem: string,
): boolean {
  const cert = new X509Certificate(certPem);
  const privateKey = createPrivateKey(privateKeyPem);
  const derivedPublic = createPublicKey(privateKey);
  return spkiDerEquals(cert.publicKey, derivedPublic);
}

/** True iff the leaf certificate's CN attribute equals `expectedCn`. Used to
 *  reject a cert accidentally uploaded from a different branch/merchant. */
export function verifySubjectCn(
  certPem: string,
  expectedCn: string,
): boolean {
  const cert = new X509Certificate(certPem);
  return extractCn(cert.subject) === expectedCn;
}

// ----- helpers ---------------------------------------------------------------

/** Node's `X509Certificate.subject` returns a newline-separated string like
 *  "C=ET\nO=…\nCN=1234567890". Multi-line CNs are theoretical here (the CN is
 *  always a TIN), but be strict about picking the CN= line specifically. */
function extractCn(subject: string): string {
  for (const line of subject.split('\n')) {
    if (line.startsWith('CN=')) return line.slice(3).trim();
  }
  return '';
}

function spkiDerEquals(a: KeyObject, b: KeyObject): boolean {
  const derA = a.export({ format: 'der', type: 'spki' });
  const derB = b.export({ format: 'der', type: 'spki' });
  return derA.equals(derB);
}
