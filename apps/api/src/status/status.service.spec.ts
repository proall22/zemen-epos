import { ConfigService } from '@nestjs/config';

import type { HealthReport, HealthService } from '../health/health.service';
import {
  StatusService,
  capabilityState,
  notificationState,
  worstState,
} from './status.service';

const mkHealth = (report: HealthReport): HealthService =>
  ({ check: () => Promise.resolve(report) }) as unknown as HealthService;

const mkConfig = (notificationsEnabled: boolean): ConfigService =>
  ({
    get: (key: string) =>
      key === 'NOTIFICATIONS_ENABLED'
        ? notificationsEnabled
          ? 'true'
          : 'false'
        : undefined,
  }) as unknown as ConfigService;

describe('status mapping helpers', () => {
  it('maps a required dependency: ok/skipped -> operational, down -> down', () => {
    expect(capabilityState({ status: 'ok', latencyMs: 3 })).toEqual({
      state: 'operational',
      latencyMs: 3,
    });
    expect(capabilityState({ status: 'down' }).state).toBe('down');
    expect(capabilityState({ status: 'skipped' }).state).toBe('operational');
  });

  it('treats an unreachable queue as degraded, missing config as degraded', () => {
    expect(notificationState({ status: 'ok' }).state).toBe('operational');
    expect(notificationState({ status: 'down' }).state).toBe('down');
    expect(notificationState({ status: 'skipped' }).state).toBe('degraded');
  });

  it('worstState picks the most severe', () => {
    expect(worstState(['operational', 'degraded', 'operational'])).toBe(
      'degraded',
    );
    expect(worstState(['operational', 'down', 'degraded'])).toBe('down');
    expect(worstState(['operational'])).toBe('operational');
  });
});

describe('StatusService.getReport', () => {
  const allOk: HealthReport = {
    status: 'ok',
    checks: { db: { status: 'ok', latencyMs: 2 }, redis: { status: 'ok' } },
  };

  it('omits notifications when disabled; api + invoicing only', async () => {
    const svc = new StatusService(mkHealth(allOk), mkConfig(false));
    const report = await svc.getReport(1000);
    expect(report.components.map((c) => c.key)).toEqual(['api', 'invoicing']);
    expect(report.status).toBe('operational');
  });

  it('includes notifications when enabled', async () => {
    const svc = new StatusService(mkHealth(allOk), mkConfig(true));
    const report = await svc.getReport(1000);
    expect(report.components.map((c) => c.key)).toEqual([
      'api',
      'invoicing',
      'notifications',
    ]);
  });

  it('reports invoicing down + overall down when the datastore is down', async () => {
    const dbDown: HealthReport = {
      status: 'degraded',
      checks: { db: { status: 'down' }, redis: { status: 'ok' } },
    };
    const svc = new StatusService(mkHealth(dbDown), mkConfig(true));
    const report = await svc.getReport(1000);
    expect(report.components.find((c) => c.key === 'invoicing')?.state).toBe(
      'down',
    );
    expect(report.status).toBe('down');
  });

  it('never leaks internal component names or raw error messages', async () => {
    const leaky: HealthReport = {
      status: 'degraded',
      checks: {
        db: { status: 'down', message: 'getaddrinfo ENOTFOUND postgres' },
        redis: { status: 'down', message: 'connect ECONNREFUSED redis:6379' },
      },
    };
    const svc = new StatusService(mkHealth(leaky), mkConfig(true));
    const json = JSON.stringify(await svc.getReport(1000)).toLowerCase();
    for (const forbidden of [
      'postgres',
      'redis',
      'vault',
      'econnrefused',
      'enotfound',
      'message',
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('caches within the TTL window (one probe for repeat calls)', async () => {
    const health = mkHealth(allOk);
    const spy = jest.spyOn(health, 'check');
    const svc = new StatusService(health, mkConfig(false));
    await svc.getReport(1000);
    await svc.getReport(1500);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
