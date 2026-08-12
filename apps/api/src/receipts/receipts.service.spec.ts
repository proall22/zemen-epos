import { ReceiptsService } from './receipts.service';
import type { CreateReceiptDto } from './dto/create-receipt.dto';

// buildPayload is pure (uses only its arguments), so we can exercise it on a
// bare instance without wiring the DI graph.
const svc = new (ReceiptsService as unknown as { new (): ReceiptsService })();
const buildPayload = (input: CreateReceiptDto) =>
  (
    svc as unknown as {
      buildPayload: (
        i: CreateReceiptDto,
        id: { tin: string; systemType: string; systemNumber: string },
        n: { receiptNumber: string; receiptCounter: number },
        m: Map<string, { irn: string }>,
      ) => { TransactionDetails: Record<string, unknown> };
    }
  ).buildPayload(
    input,
    { tin: 'T', systemType: 'POS', systemNumber: 'S' },
    { receiptNumber: 'REC0000000000000001', receiptCounter: 1 },
    new Map([['inv1', { irn: 'IRN-1' }]]),
  );

const baseInput = (
  overrides: Partial<CreateReceiptDto['transactionDetails']>,
): CreateReceiptDto =>
  ({
    collectedAmount: 400,
    invoices: [
      {
        invoiceId: 'inv1',
        paymentCoverage: 'PARTIAL',
        invoicePaidAmount: 400,
        totalAmount: 560,
      },
    ],
    transactionDetails: {
      paymentMode: 'CREDIT',
      modeOfPayment: 'CASH',
      collectorName: 'Ruth',
      ...overrides,
    },
  }) as CreateReceiptDto;

describe('ReceiptsService.buildPayload — ModeOfPayment mapping', () => {
  it('sends the instrument (modeOfPayment) to MoR, not the CASH/ADVANCE/CREDIT classification', () => {
    // Regression for the MoR "enum" 400: ModeOfPayment must be a valid
    // instrument even when the settlement classification is CREDIT/ADVANCE.
    const payload = buildPayload(
      baseInput({ paymentMode: 'CREDIT', modeOfPayment: 'CHEQUE', chequeNumber: '123' }),
    );
    expect(payload.TransactionDetails.ModeOfPayment).toBe('CHEQUE');
    expect(payload.TransactionDetails.ChequeNumber).toBe('123');
  });

  it('only emits MoR-valid instruments for the ModeOfPayment field', () => {
    const valid = [
      'CASH',
      'CHEQUE',
      'CPO',
      'SWIFT',
      'CARD',
      'WIRE',
      'BANK_TRANSFER',
      'LETTER_OF_CREDIT',
    ];
    for (const instrument of valid) {
      const payload = buildPayload(
        baseInput({ paymentMode: 'ADVANCE', modeOfPayment: instrument }),
      );
      expect(valid).toContain(payload.TransactionDetails.ModeOfPayment);
    }
  });
});
