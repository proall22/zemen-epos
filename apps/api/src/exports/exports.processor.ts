import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import archiver from 'archiver';
import { Job } from 'bullmq';

import { csvCell } from '../common/csv';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { exportsConfig } from './exports.config';
import { EXPORTS_QUEUE, type ExportJob } from './exports.types';
import { ExportsService } from './exports.service';
import { renderInvoicePdf } from './pdf/invoice-pdf';
import { renderReceiptPdf } from './pdf/receipt-pdf';

/** How many records we keep in memory at once. The Prisma cursor pattern
 *  below pages through invoices/receipts in chunks so a merchant with
 *  100k invoices doesn't OOM the worker. */
const BATCH = 200;

@Processor(EXPORTS_QUEUE)
export class ExportsProcessor extends WorkerHost {
  private readonly logger = new Logger(ExportsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly exports: ExportsService,
    private readonly notifications: NotificationsService,
    @Inject(exportsConfig.KEY)
    private readonly config: ConfigType<typeof exportsConfig>,
  ) {
    super();
  }

  async process(job: Job<ExportJob>): Promise<void> {
    const { exportId } = job.data;
    const row = await this.prisma.merchantExport.findUnique({
      where: { id: exportId },
    });
    if (!row) {
      this.logger.warn(`export ${exportId} missing — skipping`);
      return;
    }
    await this.exports.markProcessing(exportId);

    const workDir = await mkdtemp(join(tmpdir(), `eirms-export-${exportId}-`));
    try {
      const counts = await this.materialise(row.merchantId, workDir);
      const finalPath = await this.zipAndStore(
        exportId,
        row.merchantId,
        workDir,
      );
      await this.exports.markReady(exportId, {
        filePath: finalPath.relative,
        fileBytes: finalPath.bytes,
        ...counts,
      });
      await this.notifications.enqueue({
        action: 'merchant.export.ready',
        exportId,
      });
    } catch (err) {
      this.logger.error(
        `export ${exportId} failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      await this.exports.markFailed(exportId, (err as Error).message);
      await this.notifications
        .enqueue({ action: 'merchant.export.failed', exportId })
        .catch(() => undefined);
      throw err;
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }

  /** Walk every relevant table for the merchant, writing JSON / PDF files
   *  into `dir/` ready to be zipped. Returns row counts for the audit row. */
  private async materialise(
    merchantId: string,
    dir: string,
  ): Promise<{
    invoiceCount: number;
    receiptCount: number;
    inventoryCount: number;
    buyerCount: number;
  }> {
    await Promise.all([
      mkdir(join(dir, 'invoices', 'json'), { recursive: true }),
      mkdir(join(dir, 'invoices', 'pdf'), { recursive: true }),
      mkdir(join(dir, 'receipts', 'json'), { recursive: true }),
      mkdir(join(dir, 'receipts', 'pdf'), { recursive: true }),
      mkdir(join(dir, 'inventory'), { recursive: true }),
      mkdir(join(dir, 'buyers'), { recursive: true }),
      mkdir(join(dir, 'audit'), { recursive: true }),
    ]);

    const invoiceCount = await this.dumpInvoices(merchantId, dir);
    const receiptCount = await this.dumpReceipts(merchantId, dir);
    const inventoryCount = await this.dumpInventory(merchantId, dir);
    const buyerCount = await this.dumpBuyers(merchantId, dir);
    await this.dumpAudit(merchantId, dir);

    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      include: { branches: true },
    });
    await writeFile(
      join(dir, 'manifest.json'),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          merchant: {
            id: merchant.id,
            legalName: merchant.legalName,
            tin: merchant.tin,
            vatNumber: merchant.vatNumber,
          },
          branches: merchant.branches.map((b) => ({
            id: b.id,
            name: b.name,
            systemNumber: b.systemNumber,
          })),
          counts: { invoiceCount, receiptCount, inventoryCount, buyerCount },
          schemaVersion: 1,
        },
        null,
        2,
      ),
    );

    return { invoiceCount, receiptCount, inventoryCount, buyerCount };
  }

  private async dumpInvoices(merchantId: string, dir: string): Promise<number> {
    let cursor: string | undefined;
    let count = 0;
    for (;;) {
      const batch = await this.prisma.invoice.findMany({
        where: { merchantId },
        include: { items: true, buyer: true, merchant: true, branch: true },
        orderBy: { id: 'asc' },
        take: BATCH,
        skip: cursor ? 1 : 0,
        ...(cursor ? { cursor: { id: cursor } } : {}),
      });
      if (batch.length === 0) break;
      for (const inv of batch) {
        const base = safeFilename(`${inv.documentNumber || inv.id}`);
        await writeFile(
          join(dir, 'invoices', 'json', `${base}.json`),
          JSON.stringify(inv, null, 2),
        );
        await renderInvoicePdf(
          inv,
          join(dir, 'invoices', 'pdf', `${base}.pdf`),
        );
        count += 1;
      }
      cursor = batch[batch.length - 1].id;
      if (batch.length < BATCH) break;
    }
    return count;
  }

  private async dumpReceipts(merchantId: string, dir: string): Promise<number> {
    let cursor: string | undefined;
    let count = 0;
    for (;;) {
      const batch = await this.prisma.receipt.findMany({
        where: { merchantId },
        include: {
          merchant: true,
          branch: true,
          invoices: { include: { invoice: { include: { buyer: true } } } },
        },
        orderBy: { id: 'asc' },
        take: BATCH,
        skip: cursor ? 1 : 0,
        ...(cursor ? { cursor: { id: cursor } } : {}),
      });
      if (batch.length === 0) break;
      for (const r of batch) {
        const base = safeFilename(`${r.receiptNumber || r.id}`);
        await writeFile(
          join(dir, 'receipts', 'json', `${base}.json`),
          JSON.stringify(r, null, 2),
        );
        await renderReceiptPdf(r, join(dir, 'receipts', 'pdf', `${base}.pdf`));
        count += 1;
      }
      cursor = batch[batch.length - 1].id;
      if (batch.length < BATCH) break;
    }
    return count;
  }

  private async dumpInventory(
    merchantId: string,
    dir: string,
  ): Promise<number> {
    const items = await this.prisma.inventoryItem.findMany({
      where: { merchantId },
      orderBy: [{ branchId: 'asc' }, { code: 'asc' }],
    });
    await writeFile(
      join(dir, 'inventory', 'inventory.json'),
      JSON.stringify(items, null, 2),
    );
    const headers = [
      'id',
      'branchId',
      'code',
      'name',
      'unit',
      'quantity',
      'unitPrice',
      'taxCode',
    ] as const;
    const rows = [headers.join(',')];
    for (const i of items) {
      rows.push(
        headers
          .map((h) => csvCell((i as Record<string, unknown>)[h]))
          .join(','),
      );
    }
    await writeFile(join(dir, 'inventory', 'inventory.csv'), rows.join('\n'));
    return items.length;
  }

  private async dumpBuyers(merchantId: string, dir: string): Promise<number> {
    const buyers = await this.prisma.buyer.findMany({
      where: { merchantId },
      orderBy: { tin: 'asc' },
    });
    await writeFile(
      join(dir, 'buyers', 'buyers.json'),
      JSON.stringify(buyers, null, 2),
    );
    return buyers.length;
  }

  /** Audit log goes out as JSONL so a 1M-row trail doesn't blow JSON.parse. */
  private async dumpAudit(merchantId: string, dir: string): Promise<void> {
    let cursor: string | undefined;
    const file = createWriteStream(join(dir, 'audit', 'audit-logs.jsonl'));
    try {
      for (;;) {
        const batch = await this.prisma.auditLog.findMany({
          where: { merchantId },
          orderBy: { id: 'asc' },
          take: BATCH,
          skip: cursor ? 1 : 0,
          ...(cursor ? { cursor: { id: cursor } } : {}),
        });
        if (batch.length === 0) break;
        for (const row of batch) file.write(`${JSON.stringify(row)}\n`);
        cursor = batch[batch.length - 1].id;
        if (batch.length < BATCH) break;
      }
    } finally {
      file.end();
    }
  }

  /** Zip the working dir into the configured storage path, return relative
   *  path + byte count for the audit row. */
  private async zipAndStore(
    exportId: string,
    merchantId: string,
    workDir: string,
  ): Promise<{ relative: string; bytes: number }> {
    const relative = join(merchantId, `${exportId}.zip`);
    const finalPath = join(this.config.storageDir, relative);
    await mkdir(join(this.config.storageDir, merchantId), { recursive: true });
    const output = createWriteStream(finalPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.directory(workDir, false);
    const closed = pipeline(archive, output);
    await archive.finalize();
    await closed;
    const { size } = await import('node:fs/promises').then((m) =>
      m.stat(finalPath),
    );
    return { relative, bytes: size };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ExportJob>, err: Error): void {
    this.logger.error(
      `export ${job.data.exportId} attempt ${job.attemptsMade} failed: ${err.message}`,
    );
  }
}

function safeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'unnamed';
}
