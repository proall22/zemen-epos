import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'owner@acme.et' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({
    description:
      'Cloudflare Turnstile token. Required when TURNSTILE_ENABLED=true.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  turnstileToken?: string;
}
