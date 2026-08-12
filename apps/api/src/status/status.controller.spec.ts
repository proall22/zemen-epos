import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import type { HealthReport } from '../health/health.service';
import { HealthService } from '../health/health.service';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';

const health = { check: jest.fn() };

// Fresh app per test so StatusService's in-memory cache starts empty each time.
async function bootstrap(notificationsEnabled = true): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [StatusController],
    providers: [
      StatusService,
      { provide: HealthService, useValue: health },
      {
        provide: ConfigService,
        useValue: { get: () => (notificationsEnabled ? 'true' : 'false') },
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

const OK: HealthReport = {
  status: 'ok',
  checks: { db: { status: 'ok', latencyMs: 1 }, redis: { status: 'ok' } },
};
const DB_DOWN: HealthReport = {
  status: 'degraded',
  checks: {
    db: { status: 'down', message: 'ECONNREFUSED postgres:5432' },
    redis: { status: 'ok' },
  },
};

describe('StatusController', () => {
  let app: INestApplication;
  afterEach(async () => {
    await app?.close();
    health.check.mockReset();
  });

  it('GET /status → 200 operational with public components', async () => {
    health.check.mockResolvedValue(OK);
    app = await bootstrap();
    const res = await request(app.getHttpServer()).get('/status');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('operational');
    expect(res.body.components.map((c: { key: string }) => c.key)).toEqual([
      'api',
      'invoicing',
      'notifications',
    ]);
  });

  it('GET /status → 503 when a backing dependency is down', async () => {
    health.check.mockResolvedValue(DB_DOWN);
    app = await bootstrap();
    const res = await request(app.getHttpServer()).get('/status');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('down');
  });

  it('GET /status/invoicing → 503 and only that component', async () => {
    health.check.mockResolvedValue(DB_DOWN);
    app = await bootstrap();
    const res = await request(app.getHttpServer()).get('/status/invoicing');
    expect(res.status).toBe(503);
    expect(res.body.key).toBe('invoicing');
    expect(res.body.state).toBe('down');
  });

  it('GET /status/:unknown → 404', async () => {
    health.check.mockResolvedValue(OK);
    app = await bootstrap();
    const res = await request(app.getHttpServer()).get('/status/postgres');
    expect(res.status).toBe(404);
  });

  it('never leaks internal names/errors over HTTP', async () => {
    health.check.mockResolvedValue(DB_DOWN);
    app = await bootstrap();
    const res = await request(app.getHttpServer()).get('/status');
    const body = JSON.stringify(res.body).toLowerCase();
    for (const forbidden of ['postgres', 'redis', 'econnrefused', 'message']) {
      expect(body).not.toContain(forbidden);
    }
  });
});
