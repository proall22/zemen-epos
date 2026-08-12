import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReservationLineDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  inventoryItemId!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.0001)
  quantity!: number;
}

export class UpsertReservationsDto {
  @ApiProperty({
    description:
      'Client-generated UUID identifying this cart. One session can hold many reservations (one per line in the cart).',
  })
  @IsString()
  @IsNotEmpty()
  cartSessionId!: string;

  @ApiProperty({ type: [ReservationLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReservationLineDto)
  items!: ReservationLineDto[];
}
