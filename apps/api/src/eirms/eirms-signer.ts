import { createSign } from 'node:crypto';

/**
 * Builds the signed envelope MoR's HTTPS gateway requires:
 *
 *   { request: {…}, signature: "<base64>", certificate: "<base64>" }
 *
 * The plain-HTTP gateway accepts a bare body; HTTPS rejects it with
 * `400 "request/certificate/signature must not be null"` unless wrapped.
 *
 * Contract confirmed by verifying a real INSA-signed sample from MoR against
 * the leaf certificate's public key (see eirms-signer.spec.ts):
 *   - algorithm:   SHA512withRSA (PKCS#1 v1.5) — NOT SHA256.
 *   - request:     the JSON object, sent inline.
 *   - signed bytes: JSON.stringify(request) — compact JSON, fields in the order
 *                   the object is built, no whitespace.
 *   - signature:   base64 of the RSA-SHA512 signature over those bytes.
 *   - certificate: base64 of the INSA-issued certificate file verbatim (the file
 *                  carries Subject/Issuer headers + the full PEM chain).
 *
 * `request` is sent as an object and signed as its own JSON serialization; axios
 * serializes the sub-object with the same engine, so the transmitted bytes are
 * identical to the signed bytes — no canonicalization drift.
 */

export interface SignedEnvelope {
  request: unknown;
  signature: string;
  certificate: string;
}

export interface SigningMaterial {
  /** PEM-encoded RSA private key (the key paired with the CSR sent to INSA). */
  privateKeyPem: string;
  /** The INSA-issued certificate file, verbatim. */
  certificateFile: string;
}

export function signEnvelope(
  request: unknown,
  material: SigningMaterial,
): SignedEnvelope {
  const signature = createSign('RSA-SHA512')
    .update(canonicalRequest(request), 'utf-8')
    .sign(material.privateKeyPem, 'base64');

  return {
    request,
    signature,
    certificate: Buffer.from(material.certificateFile, 'utf-8').toString(
      'base64',
    ),
  };
}

/** The exact byte string that gets signed — compact JSON of the request. */
export function canonicalRequest(request: unknown): string {
  return JSON.stringify(request);
}
