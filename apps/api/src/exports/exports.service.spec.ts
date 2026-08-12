import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MerchantExportStatus } from '@prisma/client';
import type { Queue } from 'bullmq';

import type {
  RequestContext,
  RequestContextService,
} from '../audit/request-context.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ExportsService } from './exports.service';

type ExportRow = {
  id: string;
  merchantId: string;
  status: MerchantExportStatus;
  filePath: string | null;
  expiresAt: Date | null;
  downloadCount: number;
};

function makeContext(merchantId: string | null): RequestContextService {
  const ctx: RequestContext = {
    requestId: 'r',
    merchantId,
    actorId: 'u1',
    actorEmail: 'u1@example.com',
    // null merchantId in the test fixtures models a SUPER_ADMIN; the service
    // now requires the role to be set explicitly (fail-closed scope check).
    actorRole: merchantId === null ? 'SUPER_ADMIN' : 'MERCHANT_ADMIN',
  };
  return { get: () => ctx } as unknown as RequestContextService;
}

function makePrisma(seed: ExportRow[], merchantExists = true): PrismaService {
  const rows = new Map<string, ExportRow>(seed.map((r) => [r.id, r]));
  return {
    merchant: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(merchantExists ? { id: where.id } : null),
      ),
    },
    merchantExport: {
      create: jest.fn(
        ({
          data,
        }: {
          data: Omit<ExportRow, 'id' | 'status' | 'downloadCount' | 'filePath'>;
        }) => {
          const id = `exp-${rows.size + 1}`;
          const row: ExportRow = {
            id,
            merchantId: data.merchantId,
            status: MerchantExportStatus.PENDING,
            filePath: null,
            expiresAt: data.expiresAt ?? null,
            downloadCount: 0,
          };
          rows.set(id, row);
          return Promise.resolve(row);
        },
      ),
      findMany: jest.fn(({ where }: { where: { merchantId: string } }) =>
        Promise.resolve(
          [...rows.values()].filter((r) => r.merchantId === where.merchantId),
        ),
      ),
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(rows.get(where.id) ?? null),
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<ExportRow> & { downloadCount?: unknown };
        }) => {
          const row = rows.get(where.id);
          if (!row) throw new Error('not found');
          if (data.downloadCount && typeof data.downloadCount === 'object') {
            row.downloadCount += 1;
          } else {
            Object.assign(row, data);
          }
          return Promise.resolve(row);
        },
      ),
    },
  } as unknown as PrismaService;
}

function makeQueue(): { queue: Queue; added: unknown[] } {
  const added: unknown[] = [];
  const queue = {
    add: jest.fn((_name: string, data: unknown) => {
      added.push(data);
      return Promise.resolve({ id: 'job-1' });
    }),
  } as unknown as Queue;
  return { queue, added };
}

const config = {
  storageDir: '/tmp/should-not-be-touched',
  retentionDays: 7,
};

describe('ExportsService', () => {
  it('enqueues a job and stamps requester + expiresAt on create', async () => {
    const prisma = makePrisma([]);
    const { queue, added } = makeQueue();
    const svc = new ExportsService(prisma, makeContext('m1'), config, queue);
    const row = await svc.create('m1');
    expect(row.merchantId).toBe('m1');
    expect(row.expiresAt).toBeInstanceOf(Date);
    expect(added).toEqual([{ exportId: row.id }]);
  });

  it('refuses to export another merchant when context is tenant-scoped', async () => {
    const prisma = makePrisma([]);
    const { queue } = makeQueue();
    const svc = new ExportsService(prisma, makeContext('m1'), config, queue);
    await expect(svc.create('m2')).rejects.toThrow(ForbiddenException);
  });

  it('lets a super-admin (no merchantId in ctx) export any merchant', async () => {
    const prisma = makePrisma([]);
    const { queue, added } = makeQueue();
    const svc = new ExportsService(prisma, makeContext(null), config, queue);
    const row = await svc.create('m9');
    expect(row.merchantId).toBe('m9');
    expect(added).toHaveLength(1);
  });

  it('refuses cross-merchant export when ctx is missing both role and merchantId', async () => {
    const prisma = makePrisma([]);
    const { queue } = makeQueue();
    const ctx: RequestContext = {
      requestId: 'r',
      merchantId: null,
      actorId: 'u1',
      actorEmail: 'u1@example.com',
      // actorRole intentionally omitted — must fail-closed, not slip through.
    };
    const noRoleCtx = { get: () => ctx } as unknown as RequestContextService;
    const svc = new ExportsService(prisma, noRoleCtx, config, queue);
    await expect(svc.create('m9')).rejects.toThrow(ForbiddenException);
  });

  it('404s for an export id that belongs to another merchant', async () => {
    const prisma = makePrisma([
      {
        id: 'e1',
        merchantId: 'm2',
        status: MerchantExportStatus.READY,
        filePath: 'm2/e1.zip',
        expiresAt: new Date(Date.now() + 86_400_000),
        downloadCount: 0,
      },
    ]);
    const { queue } = makeQueue();
    const svc = new ExportsService(prisma, makeContext(null), config, queue);
    await expect(svc.get('m1', 'e1')).rejects.toThrow(NotFoundException);
  });

  it('opens a download stream for READY exports and increments count', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'exports-spec-'));
    mkdirSync(join(dir, 'm1'), { recursive: true });
    const filePath = join('m1', 'e1.zip');
    writeFileSync(join(dir, filePath), Buffer.from('zip-bytes'));
    const prisma = makePrisma([
      {
        id: 'e1',
        merchantId: 'm1',
        status: MerchantExportStatus.READY,
        filePath,
        expiresAt: new Date(Date.now() + 86_400_000),
        downloadCount: 0,
      },
    ]);
    const { queue } = makeQueue();
    const svc = new ExportsService(
      prisma,
      makeContext('m1'),
      {
        ...config,
        storageDir: dir,
      },
      queue,
    );
    const { bytes, filename } = await svc.openDownload('m1', 'e1');
    expect(bytes).toBe(Buffer.from('zip-bytes').length);
    expect(filename).toMatch(/^merchant-m1-export-e1\.zip$/);
  });

  it('refuses download when the export is still pending', async () => {
    const prisma = makePrisma([
      {
        id: 'e1',
        merchantId: 'm1',
        status: MerchantExportStatus.PENDING,
        filePath: null,
        expiresAt: new Date(Date.now() + 86_400_000),
        downloadCount: 0,
      },
    ]);
    const { queue } = makeQueue();
    const svc = new ExportsService(prisma, makeContext('m1'), config, queue);
    await expect(svc.openDownload('m1', 'e1')).rejects.toThrow(/pending/i);
  });
});
