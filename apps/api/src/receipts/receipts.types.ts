export interface ReceiptUpstreamBody {
  id?: number;
  status?: string;
  rrn?: string;
  qr?: string;
}

export interface ReceiptUpstreamEnvelope {
  statusCode: number;
  message: string;
  body: ReceiptUpstreamBody | Record<string, unknown> | unknown[] | null;
}

/** MoR /v1/verify envelope as returned for a receipt lookup. */
export interface VerifyReceiptUpstreamEnvelope {
  statusCode: number;
  message: string;
  body: Record<string, unknown> | unknown[] | null;
}

/** Flat shape MoR returns for some non-active states (mirrors the invoice
 *  verify flat response, e.g. `{ message, status }`). */
export interface VerifyReceiptFlatResponse {
  message: string;
  status: string;
}

export type VerifyReceiptResult =
  | VerifyReceiptUpstreamEnvelope
  | VerifyReceiptFlatResponse;
