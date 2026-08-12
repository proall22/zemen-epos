import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export type WriteOffReason = 'DAMAGE' | 'EXPIRY' | 'THEFT' | 'INTERNAL_USE';

export class WriteOffDto {
  @ApiProperty({
    example: 3,
    description:
      'Positive quantity to remove from on-hand. The service applies it as a negative delta on the ledger.',
  })
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @ApiProperty({ enum: ['DAMAGE', 'EXPIRY', 'THEFT', 'INTERNAL_USE'] })
  @IsIn(['DAMAGE', 'EXPIRY', 'THEFT', 'INTERNAL_USE'])
  reason!: WriteOffReason;

  @ApiProperty({
    description:
      'Required note describing what happened — the whole point of a write-off vs a bare adjustment.',
  })
  @IsString()
  @IsNotEmpty()
  note!: string;

  @ApiPropertyOptional({
    description:
      'Target store. Defaults to the branch sales-floor / default store if omitted.',
  })
  @IsOptional()
  @IsString()
  storeId?: string;
}
