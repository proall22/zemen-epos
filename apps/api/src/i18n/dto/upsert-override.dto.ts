import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpsertOverrideDto {
  @ApiProperty({
    description:
      'Override value for the given (language, key). Empty string is refused — delete the override instead.',
  })
  @IsString()
  @IsNotEmpty()
  value!: string;
}
