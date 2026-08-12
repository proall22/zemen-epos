import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AuditController } from './audit.controller';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { BranchContextInterceptor } from './branch-context.interceptor';
import { ConsentContextInterceptor } from './consent-context.interceptor';
import { RequestContextService } from './request-context.service';

/**
 * Global so any service (invoices, receipts, eirms-auth) can inject AuditService
 * to record OUTBOUND calls, and so the per-request context is shared app-wide.
 * The request context itself is opened by a plain Express middleware in main.ts
 * (Express-5-safe), then the AuditInterceptor fills in the actor + records
 * INBOUND actions.
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [
    AuditService,
    RequestContextService,
    // BranchContextInterceptor runs first so the audit interceptor sees the
    // resolved branchId on its own row.
    { provide: APP_INTERCEPTOR, useClass: BranchContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    // ConsentContextInterceptor runs AFTER AuditInterceptor's setActor so its
    // ctx.setMerchant override (consented SUPER_ADMIN) wins over the null the
    // JWT seeds, and the audit row records the merchant that was entered.
    { provide: APP_INTERCEPTOR, useClass: ConsentContextInterceptor },
  ],
  exports: [AuditService, RequestContextService],
})
export class AuditModule {}
