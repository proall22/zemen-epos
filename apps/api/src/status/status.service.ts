import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { HealthService, type HealthCheck } from '../health/health.service';
import type {
  ComponentState,
  ComponentStatus,
  StatusReport,
} from './status.types';

// Short cache so a public, unauthenticated endpoint can't be used to hammer
// the DB/Redis — every visitor within the window shares one probe.
const CACHE_TTL_MS = 10_000;

const SEVERITY: Record<ComponentState, number> = {
  operational: 0,
  degraded: 1,
  down: 2,
};

/**
 * Builds the public status report. Internal components (Postgres, Redis, Vault)
 * are never named or exposed individually — each is mapped into a business
 * capability a customer/SLA cares about. The MoR upstream is intentionally not
 * tracked here.
 */
@Injectable()
export class StatusService {
  private cache: { report: StatusReport; expires: number } | null = null;

  constructor(
    private readonly health: HealthService,
    private readonly config: ConfigService,
  ) {}

  async getReport(now = Date.now()): Promise<StatusReport> {
    if (this.cache && this.cache.expires > now) return this.cache.report;
    const report = await this.buildReport();
    this.cache = { report, expires: now + CACHE_TTL_MS };
    return report;
  }

  async getComponent(key: string): Promise<ComponentStatus | undefined> {
    const report = await this.getReport();
    return report.components.find((c) => c.key === key);
  }

  private async buildReport(): Promise<StatusReport> {
    const internal = await this.health.check();
    const components: ComponentStatus[] = [
      {
        key: 'api',
        name: 'Core API',
        description: 'Core e-invoicing service availability.',
        // If this handler runs, the API is serving requests.
        state: 'operational',
      },
      {
        key: 'invoicing',
        name: 'Invoice & Receipt Issuance',
        description: 'Issuing and retrieving invoices and receipts.',
        ...capabilityState(internal.checks.db),
      },
    ];

    // Notifications only appears when the channel is switched on — an
    // email/SMS-disabled deployment shouldn't advertise an SLA for it.
    if (this.config.get<string>('NOTIFICATIONS_ENABLED') === 'true') {
      components.push({
        key: 'notifications',
        name: 'Buyer Notifications',
        description: 'Delivering invoice and receipt links by email and SMS.',
        ...notificationState(internal.checks.redis),
      });
    }

    return {
      status: worstState(components.map((c) => c.state)),
      updatedAt: new Date().toISOString(),
      components,
    };
  }
}

/** Map a required dependency's probe into a public state. `skipped` shouldn't
 *  happen for a required backend, but treat it as operational rather than
 *  inventing an outage. */
export function capabilityState(check: HealthCheck): {
  state: ComponentState;
  latencyMs?: number;
} {
  const state: ComponentState = check.status === 'down' ? 'down' : 'operational';
  return { state, latencyMs: check.latencyMs };
}

/** Notifications are enabled here, so a missing/unreachable queue backend is a
 *  real degradation rather than a clean skip. */
export function notificationState(check: HealthCheck): {
  state: ComponentState;
  latencyMs?: number;
} {
  const state: ComponentState =
    check.status === 'ok'
      ? 'operational'
      : check.status === 'down'
        ? 'down'
        : 'degraded';
  return { state, latencyMs: check.latencyMs };
}

export function worstState(states: ComponentState[]): ComponentState {
  return states.reduce<ComponentState>(
    (acc, s) => (SEVERITY[s] > SEVERITY[acc] ? s : acc),
    'operational',
  );
}
