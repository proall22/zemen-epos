import { Global, Module } from '@nestjs/common';

import { ConsentController } from './consent.controller';
import { ConsentService } from './consent.service';

/** Global so the PermissionsGuard (registered as an APP_GUARD in AuthModule)
 *  can inject ConsentService to elevate a consented SUPER_ADMIN's permissions
 *  at request time. Depends only on globally-available modules (Prisma, Audit,
 *  Notifications), so it doesn't import AuthModule — no cycle. */
@Global()
@Module({
  controllers: [ConsentController],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class ConsentModule {}
