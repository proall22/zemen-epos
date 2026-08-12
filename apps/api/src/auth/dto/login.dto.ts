import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'team@e-pay.et' })
  @IsEmail()
  @MaxLength(254) // RFC 5321 cap; defensive on the email side too.
  email!: string;

  @ApiProperty({ example: 'epaypassword' })
  @IsString()
  @MinLength(1)
  // bcrypt truncates at 72 bytes, so anything beyond that is wasted work — but
  // accepting megabytes of input would let a caller burn CPU on the hash. Cap
  // at 128 so password managers with long generated phrases still fit.
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({
    description:
      'Cloudflare Turnstile token from the widget on the login form. Required when TURNSTILE_ENABLED=true on the server.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  turnstileToken?: string;
}
