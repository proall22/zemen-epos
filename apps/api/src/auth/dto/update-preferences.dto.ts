import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class UpdatePreferencesDto {
  @ApiProperty({
    enum: ['en', 'am'],
    description: 'Preferred UI language (BCP-47 short code).',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['en', 'am'])
  language!: string;
}
