import { Global, Module } from '@nestjs/common';

import { EirmsModule } from '../eirms/eirms.module';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';

/** Global so any service can resolve a merchant/branch lookup (and so the
 *  default-merchant bootstrap fires once at app boot). Phase D added the
 *  onboarding controller — list/create/update merchants + branches, with
 *  per-tenant scoping enforced inside the service. Depends on EirmsModule
 *  for the boot-time signing-material seed hook (see onModuleInit). */
@Global()
@Module({
  imports: [EirmsModule],
  controllers: [MerchantsController],
  providers: [MerchantsService],
  exports: [MerchantsService],
})
export class MerchantsModule {}
