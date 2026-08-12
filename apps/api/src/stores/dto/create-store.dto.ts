import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateStoreDto {
  @ApiProperty({ example: 'Cold Storage' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @ApiProperty({
    example: 'COLD',
    description:
      'Short stable code for the store (used on labels, transfer references). Unique within the branch.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'code must be uppercase letters, digits, underscore or hyphen',
  })
  code!: string;

  @ApiProperty({
    description: 'Branch the store belongs to. Cashiers can only target their own branch.',
  })
  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @ApiPropertyOptional({
    description:
      'When true this store becomes the sales-floor store — the POS sale path will decrement from it. At most one per branch should be flagged.',
  })
  @IsOptional()
  @IsBoolean()
  isSalesFloor?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
