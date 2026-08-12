import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type AuditLog, AuditDirection, Prisma } from '@prisma/client';

import { MetricsService } from '../observability/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { sanitiseBody } from './audit-redact';
import { RequestContextService } from './request-context.service';

const AUTH_ACTIONS = new Set([
  'auth.login',
  'auth.refresh',
  'auth.logout',
  'auth.signup',
  'auth.password.forgot',
  'auth.password.reset',
]);

export interface InboundEntry {
  action: string;
  method?: string;
  path?: string;
  entityType?: string | null;
  entityId?: string | null;
  statusCode?: number;
  success: boolean;
  errorMessage?: string;
  actor?: { sub: string; email: string; role: string } | null;
}

export interface OutboundEntry {
  action: string;
  path: string;
  requestBody?: unknown;
  responseBody?: unknown;
  statusCode?: number;
  success: boolean;
  errorMessage?: string;
  durationMs?: number;
}

export interface AuditQuery {
  direction?: AuditDirection;
  action?: string;
  actorEmail?: string;
  success?: boolean;
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
  offset?: number;
  branchId?: string;
}

@Injectable()
export class AuditService implements OnModuleInit {
  private readonly logger = new Logger(AuditService.name);
  /** Optional JSONL spill path. When set, any row whose DB insert fails is
   *  appended here as a single line so OUTBOUND tax-compliance evidence is
   *  never silently lost on a transient DB outage. Unset = no fallback. */
  private fallbackPath: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    const path = this.config.get<string>('AUDIT_FALLBACK_PATH');
    if (!path) return;
    try {
      // Ensure the directory exists once at boot — a missing dir on first
      // append would mean we lose the very row we're trying to preserve.
      mkdirSync(dirname(path), { recursive: true });
      this.fallbackPath = path;
      this.logger.log(
        `Audit fallback enabled: ${path} (DB-write failures will spill as JSONL).`,
      );
    } catch (err) {
      // Don't crash boot on a misconfigured path — but warn loudly so it's
      // obvious in startup logs.
      this.logger.error(
        `AUDIT_FALLBACK_PATH "${path}" not writable: ${(err as Error).message}. Falling back to log-only on DB failures.`,
      );
    }
  }

  /** Record an internal action. Never throws — auditing must not break the
   *  action it's recording. */
  async recordInbound(entry: InboundEntry): Promise<void> {
    const ctx = this.context.get();
    const challenge = ctx?.challenge
      ? ({ challenge: ctx.challenge } as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull;
    const row = {
      direction: AuditDirection.INBOUND,
      action: entry.action,
      actorId: entry.actor?.sub ?? ctx?.actorId ?? null,
      actorEmail: entry.actor?.email ?? ctx?.actorEmail ?? null,
      actorRole: entry.actor?.role ?? ctx?.actorRole ?? null,
      merchantId: ctx?.merchantId ?? null,
      branchId: ctx?.branchId ?? null,
      method: entry.method ?? null,
      path: entry.path ?? null,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      statusCode: entry.statusCode ?? null,
      success: entry.success,
      errorMessage: entry.errorMessage ?? null,
      responseBody: challenge,
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    };
    try {
      await this.prisma.auditLog.create({ data: row });
    } catch (err) {
      this.logger.error(
        `Failed to write INBOUND audit (${entry.action}): ${(err as Error).message}`,
      );
      this.spillToFallback(row, err);
    }
    this.metrics.auditInboundTotal
      .labels(entry.action, entry.success ? 'true' : 'false')
      .inc();
    this.emitAuditLine('INBOUND', row);
    this.recordAuthEvent(entry.action, entry.success);
  }

  /** Record an EIRMS call with its request + response. Actor is taken from the
   *  request context (the user who triggered it). Never throws. */
  async recordOutbound(entry: OutboundEntry): Promise<void> {
    const ctx = this.context.get();
    const row = {
      direction: AuditDirection.OUTBOUND,
      action: entry.action,
      actorId: ctx?.actorId ?? null,
      actorEmail: ctx?.actorEmail ?? null,
      actorRole: ctx?.actorRole ?? null,
      merchantId: ctx?.merchantId ?? null,
      branchId: ctx?.branchId ?? null,
      path: entry.path,
      statusCode: entry.statusCode ?? null,
      success: entry.success,
      errorMessage: entry.errorMessage ?? null,
      requestBody: sanitiseBody(entry.requestBody) as Prisma.InputJsonValue,
      responseBody: sanitiseBody(entry.responseBody) as Prisma.InputJsonValue,
      durationMs: entry.durationMs ?? null,
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    };
    try {
      await this.prisma.auditLog.create({ data: row });
    } catch (err) {
      this.logger.error(
        `Failed to write OUTBOUND audit (${entry.action}): ${(err as Error).message}`,
      );
      this.spillToFallback(row, err);
    }
    this.metrics.auditOutboundTotal
      .labels(entry.action, entry.success ? 'true' : 'false')
      .inc();
    this.emitAuditLine('OUTBOUND', row);
  }

  private emitAuditLine(
    kind: 'INBOUND' | 'OUTBOUND',
    row: {
      action: string;
      actorEmail?: string | null;
      actorRole?: string | null;
      merchantId?: string | null;
      branchId?: string | null;
      path?: string | null;
      statusCode?: number | null;
      success: boolean;
      errorMessage?: string | null;
      durationMs?: number | null;
    },
  ): void {
    // Write pure JSON straight to stdout — Nest's Logger.log wraps the payload
    // in a "[Nest] 1 - date LOG [ctx] {...}" prefix, which breaks Loki's `|json`.
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      stream: 'audit',
      eventType: 'audit',
      kind,
      action: row.action,
      actor: row.actorEmail ?? null,
      role: row.actorRole ?? null,
      merchantId: row.merchantId ?? null,
      branchId: row.branchId ?? null,
      path: row.path ?? null,
      statusCode: row.statusCode ?? null,
      success: row.success,
      errorMessage: row.errorMessage ?? null,
      durationMs: row.durationMs ?? null,
    });
    process.stdout.write(line + '\n');
  }

  /** Auth-lifecycle counter — bumped from recordInbound when the action
   *  matches an auth event. Kept here so the whole "who signed in / who
   *  refreshed" story is a single Prometheus counter without threading a
   *  separate service through the auth controller. */
  private recordAuthEvent(action: string, success: boolean): void {
    if (!AUTH_ACTIONS.has(action)) return;
    this.metrics.authEventsTotal
      .labels(action, success ? 'success' : 'failure')
      .inc();
  }

  /**
   * Append a row that couldn't reach the DB to the JSONL fallback so it can
   * be re-imported later. Synchronous + best-effort: a failed fallback write
   * is logged and dropped — the request that triggered the audit must not
   * be punished for a disk-full or read-only-fs outage.
   *
   * Format is one JSON object per line with a stable shape:
   *   { ts, dbError, ...row }
   * — `ts` is the audit timestamp (the DB column has a default, but we set
   * one explicitly here so re-import doesn't shift all spilled rows to
   * import-time). `dbError` records what the original failure was so the
   * importer can correlate against monitoring.
   */
  private spillToFallback(row: object, err: unknown): void {
    if (!this.fallbackPath) return;
    try {
      const line =
        JSON.stringify({
          ts: new Date().toISOString(),
          dbError: (err as Error).message?.slice(0, 200) ?? String(err),
          ...row,
        }) + '\n';
      // Sync write so the row hits the page cache before this function
      // returns — async fs.appendFile would race the process if Node is
      // about to exit (e.g. crash-on-startup). The JSONL format means a
      // partial line on a hard crash is unambiguously the only loss.
      appendFileSync(this.fallbackPath, line);
    } catch (spillErr) {
      this.logger.error(
        `Audit fallback write failed: ${(spillErr as Error).message}. Row lost.`,
      );
    }
  }

  /** Paginated, filtered list for the admin page. Omits the (potentially large)
   *  request/response bodies — those load on demand via {@link get}. */
  async list(query: AuditQuery) {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);

    const ctx = this.context.get();
    const where: Prisma.AuditLogWhereInput = {};
    // Merchant-scoped users see only their tenant's audit trail; SUPER_ADMIN
    // (ctx.merchantId === null) sees every row.
    if (ctx?.merchantId) where.merchantId = ctx.merchantId;
    if (query.branchId) where.branchId = query.branchId;
    if (query.direction) where.direction = query.direction;
    if (query.action)
      where.action = { contains: query.action, mode: 'insensitive' };
    if (query.actorEmail)
      where.actorEmail = { contains: query.actorEmail, mode: 'insensitive' };
    if (typeof query.success === 'boolean') where.success = query.success;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    if (query.q) {
      where.OR = [
        { action: { contains: query.q, mode: 'insensitive' } },
        { actorEmail: { contains: query.q, mode: 'insensitive' } },
        { entityId: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        omit: { requestBody: true, responseBody: true },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async get(id: string): Promise<AuditLog | null> {
    const ctx = this.context.get();
    return this.prisma.auditLog.findFirst({
      where: {
        id,
        // Same tenant scope as list(): merchant users can't fetch detail of
        // another tenant's row even if they guess an id.
        ...(ctx?.merchantId ? { merchantId: ctx.merchantId } : {}),
      },
    });
  }
}
