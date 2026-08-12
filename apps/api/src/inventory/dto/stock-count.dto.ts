import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * A physical stock take: "I counted the shelf, there are N". The service
 * derives the delta, so the caller never has to reason about the current
 * figure — which is the point, since a stock take exists precisely because
 * the recorded figure is not trusted.
 */
export class StockCountDto {
  @ApiProperty({
    example: 42,
    description: 'Units actually present. Cannot be negative.',
  })
  @IsNumber()
  @Min(0)
  counted!: number;

  @ApiProperty({ description: 'Store that was counted.' })
  @IsString()
  storeId!: string;

  @ApiPropertyOptional({ description: 'Who counted it, or why.' })
  @IsOptional()
  @IsString()
  note?: string;
}
