import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CancelInvoiceDto {
  @ApiProperty({
    example: '1',
    description: 'Reason code per MOR conventions (e.g. 1=duplicate)',
  })
  @IsString()
  reasonCode!: string;

  @ApiPropertyOptional({ example: '' })
  @IsOptional()
  @IsString()
  remark?: string;
}
