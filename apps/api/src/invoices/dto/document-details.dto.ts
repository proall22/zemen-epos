import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DocumentDetailsDto {
  @ApiPropertyOptional({ example: '', description: 'Leave empty for new invoice; EIRMS assigns IRN' })
  @IsOptional()
  @IsString()
  DocumentNumber?: string;

  @ApiProperty({
    example: '21-03-2025T00:00:00',
    description: 'EIRMS expects DD-MM-YYYYTHH:mm:ss',
  })
  @IsString()
  Date!: string;

  @ApiProperty({
    example: 'INV',
    description:
      'INV, CRE (credit memo), DEB (debit memo), PRF, OVD, INT, RTN, MIX, FIN',
  })
  @IsString()
  Type!: string;

  @ApiPropertyOptional({
    example: 'Refund for damaged item',
    description: 'Required by MOR schema for credit/debit memos.',
  })
  @IsOptional()
  @IsString()
  Reason?: string;
}
