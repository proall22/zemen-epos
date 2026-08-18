import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export interface EirmsSellerConfig {
  legalName: string;
  email: string;
  phone: string;
  region: string;
  wereda: string;
  vatNumber: string;
}

export interface EirmsConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  apikey: string;
  tin: string;
  systemNumber: string;
  systemType: 'POS';
  seller: EirmsSellerConfig;
  /** Address the certificate-onboarding wizard mails the CSR + DOCX to.
   *  Configurable so ops can point at an INSA staging inbox during rehearsals. */
  certificateRequestEmail: string;
}

export const eirmsConfig = registerAs<EirmsConfig>('eirms', () => ({
  baseUrl: process.env.EIRMS_BASE_URL!,
  clientId: process.env.EIRMS_CLIENT_ID!,
  clientSecret: process.env.EIRMS_CLIENT_SECRET!,
  apikey: process.env.EIRMS_API_KEY!,
  tin: process.env.EIRMS_TIN!,
  systemNumber: process.env.EIRMS_SYSTEM_NUMBER!,
  systemType: 'POS',
  seller: {
    legalName: process.env.EIRMS_SELLER_LEGAL_NAME!,
    email: process.env.EIRMS_SELLER_EMAIL!,
    phone: process.env.EIRMS_SELLER_PHONE!,
    region: process.env.EIRMS_SELLER_REGION!,
    wereda: process.env.EIRMS_SELLER_WEREDA!,
    vatNumber: process.env.EIRMS_SELLER_VAT_NUMBER!,
  },
  certificateRequestEmail:
    process.env.EIRMS_CERTIFICATE_EMAIL || 'icr@insa.gov.et',
}));

export const eirmsValidationSchema = {
  // EIRMS_BASE_URL is intentionally NOT scheme-pinned. MoR exposes two
  // gateways: an http variant that accepts a bare body (test env) and an
  // https variant that requires a signed envelope { request, signature,
  // certificate } — SHA512withRSA over JSON.stringify(request); see
  // eirms-signer.ts and EirmsSigningService. The signer + wrap-at-call-site
  // wiring is in place; switching to https means pointing EIRMS_BASE_URL at
  // the https gateway and setting EIRMS_SIGNING_PRIVATE_KEY_FILE +
  // EIRMS_SIGNING_CERT_FILE (boot fails fast if exactly one is set).
  EIRMS_BASE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required()
    .custom((value: string, helpers) => {
      if (
        process.env.NODE_ENV === 'production' &&
        !value.toLowerCase().startsWith('https://') &&
        !isApprovedMorHttpGateway(value)
      ) {
        return helpers.message({
          custom:
            'EIRMS_BASE_URL must use HTTPS in production unless it is the approved core.mor.gov.et HTTP gateway.',
        });
      }
      return value;
    }, 'production HTTPS enforcement'),
  EIRMS_CLIENT_ID: Joi.string().uuid().required(),
  EIRMS_CLIENT_SECRET: Joi.string().required(),
  EIRMS_API_KEY: Joi.string().uuid().required(),
  EIRMS_TIN: Joi.string().required(),
  EIRMS_SYSTEM_NUMBER: Joi.string().trim().min(3).max(64).required(),
  EIRMS_SYSTEM_TYPE: Joi.string().valid('POS').default('POS'),
  EIRMS_SEED_DEFAULT_CREDENTIALS: Joi.string()
    .valid('true', 'false')
    .default('false'),
  EIRMS_SELLER_LEGAL_NAME: Joi.string().required(),
  EIRMS_SELLER_EMAIL: Joi.string().required(),
  EIRMS_SELLER_PHONE: Joi.string().required(),
  EIRMS_SELLER_REGION: Joi.string().required(),
  EIRMS_SELLER_WEREDA: Joi.string().required(),
  EIRMS_SELLER_VAT_NUMBER: Joi.string().required(),
  // Request-signing material (https/prod). Optional: unset = http/test path.
  // Absolute paths to the INSA-issued private key + certificate on the host.
  EIRMS_SIGNING_PRIVATE_KEY_FILE: Joi.string().optional().allow(''),
  EIRMS_SIGNING_CERT_FILE: Joi.string().optional().allow(''),
  // Certificate-onboarding email target. Defaults to INSA's published address;
  // override in staging when INSA runs a rehearsal inbox.
  EIRMS_CERTIFICATE_EMAIL: Joi.string().email().optional(),
  JWT_SECRET: Joi.string().min(16).required(),
};

function isApprovedMorHttpGateway(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && url.hostname === 'core.mor.gov.et';
  } catch {
    return false;
  }
}
