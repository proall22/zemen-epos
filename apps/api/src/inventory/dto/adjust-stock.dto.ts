import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class AdjustStockDto {
  @ApiProperty({
    example: 10,
    description: 'Signed change to on-hand: positive to add, negative to remove',
  })
  @IsNumber()
  delta!: number;

  @ApiPropertyOptional({ enum: ['RESTOCK', 'ADJUSTMENT'], default: 'ADJUSTMENT' })
  @IsOptional()
  @IsIn(['RESTOCK', 'ADJUSTMENT'])
  reason?: 'RESTOCK' | 'ADJUSTMENT';

  @ApiPropertyOptional({ description: 'Why the stock changed' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({
    description:
      'Target store for the adjustment. Defaults to the branch sales-floor / default store if omitted.',
  })
  @IsOptional()
  @IsString()
  storeId?: string;
}
