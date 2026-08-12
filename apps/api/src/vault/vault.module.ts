import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { vaultConfig } from './vault.config';
import { VaultService } from './vault.service';

/**
 * Global so any tenant-scoped service (merchants, eirms-auth) can inject
 * VaultService without importing the module explicitly. The AuditModule is
 * already global, so VaultService can record OUTBOUND rows directly.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forFeature(vaultConfig),
    HttpModule.register({ timeout: 10_000 }),
  ],
  providers: [VaultService],
  exports: [VaultService],
})
export class VaultModule {}
