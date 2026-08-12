import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Global, Module } from '@nestjs/common';

/**
 * Shared BullMQ connection registration. Both NotificationsModule and
 * InvoicesModule (drafts-sync worker) register their own queues against
 * it via {@link BullModule.registerQueue} — calling `forRoot` more than
 * once in different feature modules would conflict on the global Bull
 * config token. Centralising it here keeps that contract clean.
 *
 * Gated on `REDIS_URL`. When the env var is unset, the module is a no-op
 * (no global Bull root, no exported BullModule) — feature modules that
 * conditionally register queues see no Bull and gracefully skip their
 * processor wiring.
 */
@Global()
@Module({})
export class BullSetupModule {
  static forRoot(): DynamicModule {
    const url = process.env.REDIS_URL;
    if (!url) {
      // No Redis → no Bull. Feature modules check the same env var
      // before adding their own queues, so this is a clean tear-out.
      return { module: BullSetupModule };
    }
    const parsed = new URL(url);
    return {
      module: BullSetupModule,
      imports: [
        BullModule.forRoot({
          connection: {
            host: parsed.hostname,
            port: Number(parsed.port || 6379),
            username: parsed.username || undefined,
            password: parsed.password || undefined,
          },
        }),
      ],
      exports: [BullModule],
    };
  }
}
