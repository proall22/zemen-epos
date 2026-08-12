import { Injectable } from '@nestjs/common';
import {
  Counter,
  collectDefaultMetrics,
  Histogram,
  Registry,
} from 'prom-client';

/**
 * Owns the single prom-client Registry the app exposes. Holding it on a
 * service (rather than the prom-client default global) means tests can spin
 * up + tear down the module without cross-pollination between describe
 * blocks, and there's no risk of double-registration when the Nest
 * application is recreated during e2e setup.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  /** Per-request count, partitioned by method + route template + status. */
  readonly httpRequestsTotal: Counter<'method' | 'route' | 'status_code'>;

  /** End-to-end request latency. Buckets cover the NTR A1 threshold (<2s)
   *  with enough headroom either side to spot outliers without losing
   *  precision on fast paths. */
  readonly httpRequestDurationSeconds: Histogram<
    'method' | 'route' | 'status_code'
  >;

  /** Audit-shaped counters — one datapoint per row we persist to audit_logs,
   *  so Grafana can render "actions/sec" charts without hitting the DB. */
  readonly auditInboundTotal: Counter<'action' | 'success'>;
  readonly auditOutboundTotal: Counter<'action' | 'success'>;
  readonly authEventsTotal: Counter<'event' | 'result'>;
  readonly emailSentTotal: Counter<'domain' | 'kind'>;
  readonly emailWebhookTotal: Counter<'status' | 'domain' | 'kind'>;

  constructor() {
    // Node runtime metrics — event loop lag, GC, heap, fd counts. Free
    // dashboard fodder for "is the api itself healthy?" alerts.
    collectDefaultMetrics({ register: this.registry });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests handled by the api, partitioned by method, route, and status.',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency in seconds, partitioned by method, route, and status.',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
      registers: [this.registry],
    });

    this.auditInboundTotal = new Counter({
      name: 'audit_inbound_total',
      help: 'INBOUND audit rows written (user actions), by action + success flag.',
      labelNames: ['action', 'success'],
      registers: [this.registry],
    });
    this.auditOutboundTotal = new Counter({
      name: 'audit_outbound_total',
      help: 'OUTBOUND audit rows written (EIRMS calls), by action + success flag.',
      labelNames: ['action', 'success'],
      registers: [this.registry],
    });
    this.authEventsTotal = new Counter({
      name: 'auth_events_total',
      help: 'Authentication lifecycle events (login/refresh/signup/logout) by result.',
      labelNames: ['event', 'result'],
      registers: [this.registry],
    });
    this.emailSentTotal = new Counter({
      name: 'email_sent_total',
      help: 'Outbound emails accepted by Resend, by recipient domain + kind (consumer|corporate).',
      labelNames: ['domain', 'kind'],
      registers: [this.registry],
    });
    this.emailWebhookTotal = new Counter({
      name: 'email_webhook_total',
      help: 'Resend webhook lifecycle events (delivered/opened/bounced/complained) by status + domain + kind.',
      labelNames: ['status', 'domain', 'kind'],
      registers: [this.registry],
    });
  }

  /** Serialised text exposition for the /metrics endpoint. */
  async render(): Promise<string> {
    return this.registry.metrics();
  }
}
