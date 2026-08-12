import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Raw token from the password reset email.' })
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token!: string;

  @ApiProperty({ example: 'a-long-fresh-password' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
