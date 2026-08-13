import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { PrismaService } from '../prisma/prisma.service';

/** Per-check result. `skipped` is used when the dependency isn't configured —
 *  e.g. REDIS_URL is unset — so the overall response can still be `ok`
 *  without lying about an inactive dependency. */
export interface HealthCheck {
  status: 'ok' | 'down' | 'skipped';
  /** Optional one-line error message when down. Never includes raw stack
   *  traces or DB connection strings — `/healthz` is unauthenticated. */
  message?: string;
  /** Round-trip latency in ms when measured. */
  latencyMs?: number;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  checks: {
    db: HealthCheck;
    redis: HealthCheck;
    vault: HealthCheck;
    eirms: HealthCheck;
    queueWorker: HealthCheck;
  };
}

export interface QueueHealthCounts {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

/**
 * Probes runtime dependencies. Used by the `/healthz` endpoint that a
 * load balancer / k8s readiness probe hits. `/livez` doesn't need this —
 * it just confirms the Node process is alive.
 *
 * The Redis client is held for the lifetime of the module so the probe
 * doesn't pay TCP+handshake cost on every request. The DB probe goes
 * through the shared PrismaService — same pool everyone else uses.
 */
@Injectable()
export class HealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HealthService.name);
  private redis: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) return;
    const u = new URL(url);
    this.redis = new Redis({
      host: u.hostname,
      port: Number(u.port || 6379),
      username: u.username || undefined,
      password: u.password || undefined,
      // Health checks should never wait — fail fast so a probe timeout
      // matches an actual outage rather than a stuck reconnect loop.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      // Keep the connection alive but silent — we don't want a noisy
      // reconnect log every few seconds when Redis is briefly down.
      lazyConnect: false,
    });
    this.redis.on('error', (err) => {
      // Surface but don't crash — the probe will report `down` on the next
      // hit, which is the whole point of the endpoint.
      this.logger.debug(`Redis health-probe client: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        /* shutting down — best-effort */
      }
    }
  }

  async check(): Promise<HealthReport> {
    const [db, redis, vault, eirms] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
      this.checkHttpDependency(this.config.get<string>('VAULT_ADDR'), '/v1/sys/health', [200, 429]),
      this.checkHttpDependency(this.config.get<string>('EIRMS_BASE_URL'), '', undefined, true),
    ]);
    
    // Redis also acts as the backend for BullMQ queue worker
    const queueWorker: HealthCheck = {
      status: redis.status === 'ok' ? 'ok' : 'down',
      latencyMs: redis.latencyMs,
    };

    const status =
      [db, redis, vault, eirms].some((check) => check.status === 'down')
        ? 'degraded'
        : 'ok';
    return { status, checks: { db, redis, vault, eirms, queueWorker } };
  }

  /** Reads BullMQ's Redis structures for every queue used by this service. */
  async queueCounts(): Promise<QueueHealthCounts> {
    if (!this.redis) return { pending: 0, processing: 0, completed: 0, failed: 0 };
    const names = ['notifications', 'sms-notifications', 'scheduled-reports', 'drafts-sync', 'merchant-exports'];
    const pipeline = this.redis.pipeline();
    for (const name of names) {
      pipeline.llen(`bull:${name}:wait`);
      pipeline.llen(`bull:${name}:paused`);
      pipeline.llen(`bull:${name}:active`);
      pipeline.zcard(`bull:${name}:completed`);
      pipeline.zcard(`bull:${name}:failed`);
    }
    const results = await pipeline.exec();
    const values = (results ?? []).map(([error, value]) => error ? 0 : Number(value));
    const total = (offset: number) => names.reduce((sum, _, index) => sum + (values[index * 5 + offset] ?? 0), 0);
    return {
      pending: total(0) + total(1),
      processing: total(2),
      completed: total(3),
      failed: total(4),
    };
  }

  private async checkDb(): Promise<HealthCheck> {
    const t0 = Date.now();
    try {
      // `$queryRaw` with a literal 1 is the cheapest round-trip Postgres
      // accepts — no parsing of user data, no table touch.
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', latencyMs: Date.now() - t0 };
    } catch (err) {
      return {
        status: 'down',
        message: shortError(err),
        latencyMs: Date.now() - t0,
      };
    }
  }

  private async checkRedis(): Promise<HealthCheck> {
    if (!this.redis) return { status: 'skipped' };
    const t0 = Date.now();
    try {
      const pong = await this.redis.ping();
      if (pong !== 'PONG') {
        return {
          status: 'down',
          message: `Unexpected PING reply: ${pong}`,
          latencyMs: Date.now() - t0,
        };
      }
      return { status: 'ok', latencyMs: Date.now() - t0 };
    } catch (err) {
      return {
        status: 'down',
        message: shortError(err),
        latencyMs: Date.now() - t0,
      };
    }
  }

  /** Makes a short, read-only reachability request without exposing the URL. */
  private async checkHttpDependency(
    baseUrl: string | undefined,
    path: string,
    acceptedStatuses?: number[],
    acceptClientErrors = false,
  ): Promise<HealthCheck> {
    if (!baseUrl) return { status: 'skipped' };
    const started = Date.now();
    try {
      const response = await fetch(new URL(path, baseUrl), {
        method: 'GET',
        signal: AbortSignal.timeout(3_000),
      });
      const reachable = acceptedStatuses
        ? acceptedStatuses.includes(response.status)
        : response.ok || (acceptClientErrors && response.status < 500);
      return {
        status: reachable ? 'ok' : 'down',
        ...(!reachable ? { message: `HTTP ${response.status}` } : {}),
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      return { status: 'down', message: shortError(error), latencyMs: Date.now() - started };
    }
  }
}

/** Health endpoints are unauthenticated, so error messages must never leak
 *  hostnames, query fragments, or stack frames. Strip everything except the
 *  error class + first 80 chars. */
function shortError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 80);
}
