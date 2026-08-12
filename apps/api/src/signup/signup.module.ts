import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SignupController } from './signup.controller';
import { SignupService } from './signup.service';

/**
 * Public signup endpoint — no auth required to call it. Imports AuthModule
 * so SignupService can delegate session minting to AuthService.issueSession,
 * keeping the access-token / refresh-cookie behaviour identical to /auth/login.
 */
@Module({
  imports: [AuthModule],
  controllers: [SignupController],
  providers: [SignupService],
})
export class SignupModule {}
