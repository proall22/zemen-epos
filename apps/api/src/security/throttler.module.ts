import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';

import { UserOrIpThrottlerGuard } from './user-or-ip-throttler.guard';

/**
 * Global rate limiter (Layer A of the security hardening). Two throttler tiers
 * are evaluated on every request and both must allow it through:
 *
 *  - `short`  — smooths bursty traffic (30 req / 10 s per tracker).
 *  - `medium` — caps sustained traffic (300 req / 1 min per tracker).
 *
 * The tracker is `req.user.sub` for authenticated requests, falling back to
 * the request IP for anonymous ones — so a single signed-in user shares
 * their budget across devices/IPs, while anonymous abuse is bounded per-IP.
 *
 * State lives in Redis (same instance BullMQ uses) so the limiter survives
 * restarts and is shared across API replicas. When `REDIS_URL` isn't set the
 * module falls back to the throttler's default in-memory store; useful for
 * single-replica local development but not for production.
 */
@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        const storage = redisUrl
          ? new ThrottlerStorageRedisService(buildRedisFromUrl(redisUrl))
          : undefined;
        return {
          throttlers: [
            { name: 'short',  ttl: seconds(10), limit: 30  },
            { name: 'medium', ttl: seconds(60), limit: 300 },
          ],
          storage,
          errorMessage:
            'Too many requests from this client. Please slow down and try again in a moment.',
        };
      },
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: UserOrIpThrottlerGuard }],
  exports: [ThrottlerModule],
})
export class AppThrottlerModule {}

/** Build an ioredis client from the same REDIS_URL the rest of the app uses.
 *  We construct it directly (rather than reusing the BullMQ client) because
 *  BullMQ may be wired off when notifications are disabled, while the
 *  throttler should be on regardless. */
function buildRedisFromUrl(url: string): Redis {
  const u = new URL(url);
  const client = new Redis({
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
    // Fail fast on outage — UserOrIpThrottlerGuard fails open on the resulting
    // rejection, so brief Redis blips don't 500 every request.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
  const logger = new Logger('ThrottlerRedis');
  client.on('error', (err) => logger.debug(`Redis: ${err.message}`));
  return client;
}
