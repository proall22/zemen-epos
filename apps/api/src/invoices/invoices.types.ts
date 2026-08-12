export interface RegisterInvoiceResponse {
  irn: string;
  ackDate: string;
  signedQR: string;
  signedInvoice: string;
  status: string;
  documentNumber: string;
  errorMessage: string | null;
}

export interface RegisterInvoiceEnvelope {
  statusCode: number;
  message: string;
  body: RegisterInvoiceResponse;
}

export interface CancelInvoiceUpstreamEnvelope {
  statusCode: number;
  message: string;
  body: Record<string, unknown> | null;
}

export interface VerifyInvoiceUpstreamEnvelope {
  statusCode: number;
  message: string;
  body: Record<string, unknown> | unknown[] | null;
}

/**
 * For a cancelled (or otherwise rejected) invoice, MOR returns a flat shape
 * instead of the standard envelope:
 *   { "message": "Invoice is cancelled", "status": "Error" }
 * We surface this as a normal verify result, not an error.
 */
export interface VerifyInvoiceFlatResponse {
  message: string;
  status: string;
}

export type VerifyInvoiceResult =
  | VerifyInvoiceUpstreamEnvelope
  | VerifyInvoiceFlatResponse;
