import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Length } from 'class-validator';

export class PendingTokenDto {
  @ApiProperty()
  @IsString()
  pendingToken!: string;
}

export class VerifyOtpDto extends PendingTokenDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 8)
  otp!: string;
}

export class SendTwoFactorDto extends PendingTokenDto {
  @ApiProperty({ enum: ['email', 'phone'] })
  @IsIn(['email', 'phone'])
  method!: 'email' | 'phone';
}

export class VerifyTwoFactorDto extends VerifyOtpDto {
  @ApiProperty({ enum: ['email', 'phone'] })
  @IsIn(['email', 'phone'])
  method!: 'email' | 'phone';
}
