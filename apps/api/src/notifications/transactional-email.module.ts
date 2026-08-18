import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { authVerificationConfig } from '../auth/auth-verification.config';
import { TransactionalEmailService } from './transactional-email.service';

@Global()
@Module({
  imports: [ConfigModule.forFeature(authVerificationConfig)],
  providers: [TransactionalEmailService],
  exports: [TransactionalEmailService],
})
export class TransactionalEmailModule {}
