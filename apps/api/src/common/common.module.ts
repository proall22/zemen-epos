import { Global, Module } from '@nestjs/common';

import { StoreResolverService } from './store-resolver.service';

/** Global for the same reason PrismaModule is: inventory, stores, purchases,
 *  pos and invoices all resolve stores, and threading an import through each
 *  of them risks a cycle (StoresModule ⇄ InventoryModule). */
@Global()
@Module({
  providers: [StoreResolverService],
  exports: [StoreResolverService],
})
export class CommonModule {}
