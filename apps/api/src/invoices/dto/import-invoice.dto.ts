import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Body of `POST /invoices/import-from-irn` — just the MoR-issued IRN to
 *  resolve against /v1/verify. Tight length cap so a misbehaving caller
 *  can't ship a multi-MB string through this route. */
export class ImportInvoiceDto {
  @ApiProperty({
    description: 'The MoR-issued IRN of the externally-issued invoice.',
    example: 'test-cd4d0e110c7b68c9dba543888be28dcdc6c1c9bb508b84d7f262e79e370f1855',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  irn!: string;
}
