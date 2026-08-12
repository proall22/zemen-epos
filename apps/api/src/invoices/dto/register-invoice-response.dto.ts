import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterInvoiceResponseDto {
  @ApiProperty({
    example: 'test-8881dd198cb3b86c782e44a1639d34ba465d89a4501c5c3e2eccefd932455ef1',
    description: 'EIRMS-assigned Invoice Reference Number',
  })
  irn!: string;

  @ApiProperty({ example: '1' })
  documentNumber!: string;

  @ApiProperty({
    example: '2026-05-14T14:52:40.362653919Z[GMT]',
    description: 'Acknowledgement timestamp from MOR (note non-standard [GMT] suffix)',
  })
  ackDate!: string;

  @ApiProperty({ example: 'A', description: 'EIRMS document status (e.g. A=Accepted)' })
  status!: string;

  @ApiProperty({ description: 'Base64-encoded PNG of the invoice QR code' })
  signedQR!: string;

  @ApiProperty({ description: 'Base64-encoded signed invoice payload' })
  signedInvoice!: string;

  @ApiPropertyOptional({ nullable: true })
  errorMessage!: string | null;
}
