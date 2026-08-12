import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import * as Joi from 'joi';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditModule } from './audit/audit.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { BuyersModule } from './buyers/buyers.module';
import { CertificatesModule } from './certificates/certificates.module';
import { ConsentModule } from './consent/consent.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { eirmsValidationSchema } from './eirms/eirms.config';
import { EirmsModule } from './eirms/eirms.module';
import { exportsValidationSchema } from './exports/exports.config';
import { ExportsModule } from './exports/exports.module';
import { reportsValidationSchema } from './reports/reports.config';
import { ReportsModule } from './reports/reports.module';
import { HealthModule } from './health/health.module';
import { I18nModule } from './i18n/i18n.module';
import { InventoryModule } from './inventory/inventory.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PosModule } from './pos/pos.module';
import { PurchasesModule } from './purchases/purchases.module';
import { StoresModule } from './stores/stores.module';
import { HarmonizationModule } from './harmonization/harmonization.module';
import { VendorsModule } from './vendors/vendors.module';
import { MerchantsModule } from './merchants/merchants.module';
import { notificationsValidationSchema } from './notifications/notifications.config';
import { NotificationsModule } from './notifications/notifications.module';
import { metricsValidationSchema } from './observability/metrics.config';
import { ObservabilityModule } from './observability/observability.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { BullSetupModule } from './common/bull-setup.module';
import { IpFilterModule } from './security/ip-filter/ip-filter.module';
import { AppThrottlerModule } from './security/throttler.module';
import { turnstileValidationSchema } from './security/turnstile/turnstile.config';
import { TurnstileModule } from './security/turnstile/turnstile.module';
import { SignupModule } from './signup/signup.module';
import { StatusModule } from './status/status.module';
import { UsersModule } from './users/users.module';
import { vaultValidationSchema } from './vault/vault.config';
import { VaultModule } from './vault/vault.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        ...eirmsValidationSchema,
        ...notificationsValidationSchema,
        ...vaultValidationSchema,
        ...metricsValidationSchema,
        ...exportsValidationSchema,
        ...reportsValidationSchema,
        ...turnstileValidationSchema,
        DATABASE_URL: Joi.string().uri().required(),
        REDIS_URL: Joi.string().optional().allow(''),
        // Offline invoice drafts — parked. Off means the endpoints 404, the
        // POS never offers "save as draft", and the sync job isn't scheduled.
        DRAFTS_ENABLED: Joi.string().valid('true', 'false').default('false'),
        SWAGGER_USER: Joi.string().optional().allow(''),
        SWAGGER_PASS: Joi.string().optional().allow(''),
        // CORS allow-list — comma-separated. Each entry is either an exact
        // origin or a regex pattern prefixed with `re:`. Empty/unset =
        // deny-all for cross-origin browser requests (fail-closed).
        CORS_ORIGINS: Joi.string().optional().allow(''),
        // Cookie attribute overrides — sensible defaults (Lax + secure-in-prod)
        // apply when these are unset; override only when running cross-site
        // (e.g. SPA on a separate origin needs `none` + `true`).
        COOKIE_SAMESITE: Joi.string().valid('lax', 'strict', 'none').optional(),
        COOKIE_SECURE: Joi.string().valid('true', 'false').optional(),
        // Optional durable spill path for OUTBOUND/INBOUND audit rows that
        // can't reach the DB. Unset = no fallback (rows logged + lost on DB
        // failure, current behaviour); set = appended as JSONL for later
        // import. See AuditService.writeFallback.
        AUDIT_FALLBACK_PATH: Joi.string().optional().allow(''),
        // Region access — comma-separated CIDR lists. Empty/unset = no filter.
        IP_ALLOW_LIST: Joi.string().optional().allow(''),
        IP_DISALLOW_LIST: Joi.string().optional().allow(''),
        // Reverse-proxy hop count for Express `trust proxy`. 0 = no proxy
        // (default), 1 = single reverse proxy (nginx), higher for chained.
        TRUSTED_PROXY_HOPS: Joi.number().integer().min(0).max(10).optional(),
        // Sentry — consumed in src/instrument.ts (process.env, before ConfigModule).
        SENTRY_DSN: Joi.string().uri().optional().allow(''),
        SENTRY_ENVIRONMENT: Joi.string().optional().allow(''),
        SENTRY_RELEASE: Joi.string().optional().allow(''),
        SENTRY_TRACES_SAMPLE_RATE: Joi.number().min(0).max(1).optional(),
        SENTRY_PROFILES_SAMPLE_RATE: Joi.number().min(0).max(1).optional(),
      }),
      validationOptions: { abortEarly: false },
    }),
    PrismaModule,
    // Region filter — must be first so blocked IPs get a fast 451 without
    // hitting the throttler / auth / audit pipeline.
    IpFilterModule,
    BullSetupModule.forRoot(),
    AppThrottlerModule,
    TurnstileModule,
    AuditModule,
    // Global — needs RequestContextService from AuditModule above.
    CommonModule,
    // Global — AuditModule must be loaded first so VaultService can record
    // OUTBOUND rows for every kv-v2 read/write. MerchantsModule and
    // EirmsModule depend on it being available.
    VaultModule,
    // Exposes /metrics + records per-request count/latency. Registered after
    // AuditModule so the HTTP middleware runs alongside the audit
    // interceptor, not in place of it.
    ObservabilityModule,
    HealthModule,
    StatusModule,
    MerchantsModule,
    // Global — CertificatesModule must be loaded before MerchantsModule's
    // provisioning hooks fire on merchant approval. Since it's @Global, order
    // in the imports array doesn't affect DI resolution, but listing it here
    // keeps the module graph self-documenting.
    CertificatesModule,
    UsersModule,
    // Global — ConsentModule provides ConsentService, injected by the
    // PermissionsGuard (an APP_GUARD in AuthModule) to elevate a consented
    // SUPER_ADMIN's permissions. Listed before AuthModule to self-document.
    ConsentModule,
    AuthModule,
    EirmsModule,
    BuyersModule,
    I18nModule,
    InventoryModule,
    StoresModule,
    HarmonizationModule,
    VendorsModule,
    PurchasesModule,
    PosModule,
    InvoicesModule,
    ReceiptsModule,
    DashboardModule,
    SignupModule,
    ExportsModule,
    ReportsModule.register(),
    NotificationsModule.register(),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Reports unhandled exceptions to Sentry; preserves normal HttpException responses.
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
  ],
})
export class AppModule {}
