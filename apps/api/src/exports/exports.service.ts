import { createReadStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { InjectQueue } from '@nestjs/bullmq';
import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { type MerchantExport, MerchantExportStatus } from '@prisma/client';
import { Queue } from 'bullmq';

import { RequestContextService } from '../audit/request-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { exportsConfig } from './exports.config';
import { EXPORTS_QUEUE, type ExportJob } from './exports.types';

@Injectable()
export class ExportsService {
  private readonly logger = new Logger(ExportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    @Inject(exportsConfig.KEY)
    private readonly config: ConfigType<typeof exportsConfig>,
    @InjectQueue(EXPORTS_QUEUE) private readonly queue: Queue<ExportJob>,
  ) {}

  async create(merchantId: string): Promise<MerchantExport> {
    this.assertOwnMerchant(merchantId);
    await this.assertMerchantExists(merchantId);
    const ctx = this.context.get();
    const expiresAt = new Date(
      Date.now() + this.config.retentionDays * 24 * 60 * 60 * 1000,
    );
    const row = await this.prisma.merchantExport.create({
      data: {
        merchantId,
        requestedBy: ctx?.actorId ?? null,
        requestedByEmail: ctx?.actorEmail ?? null,
        expiresAt,
      },
    });
    await this.queue.add(
      'process',
      { exportId: row.id },
      { jobId: row.id, removeOnComplete: 500, removeOnFail: 100 },
    );
    return row;
  }

  list(merchantId: string): Promise<MerchantExport[]> {
    this.assertOwnMerchant(merchantId);
    return this.prisma.merchantExport.findMany({
      where: { merchantId },
      orderBy: { requestedAt: 'desc' },
      take: 50,
    });
  }

  async get(merchantId: string, exportId: string): Promise<MerchantExport> {
    this.assertOwnMerchant(merchantId);
    const row = await this.prisma.merchantExport.findUnique({
      where: { id: exportId },
    });
    if (!row || row.merchantId !== merchantId) {
      throw new NotFoundException(`Export ${exportId} not found`);
    }
    return row;
  }

  /** Opens a read stream over the bundle and increments downloadCount. The
   *  controller pipes the stream to the response; existence + status checks
   *  happen here so the controller stays thin. */
  async openDownload(
    merchantId: string,
    exportId: string,
  ): Promise<{
    stream: NodeJS.ReadableStream;
    bytes: number;
    filename: string;
  }> {
    const row = await this.get(merchantId, exportId);
    if (row.status !== MerchantExportStatus.READY || !row.filePath) {
      throw new NotFoundException(
        `Export ${exportId} is ${row.status.toLowerCase()}; nothing to download yet.`,
      );
    }
    if (row.expiresAt && row.expiresAt < new Date()) {
      throw new NotFoundException(`Export ${exportId} has expired.`);
    }
    const path = this.resolveFilePath(row.filePath);
    const fileStat = await stat(path);
    await this.prisma.merchantExport.update({
      where: { id: exportId },
      data: { downloadCount: { increment: 1 } },
    });
    return {
      stream: createReadStream(path),
      bytes: fileStat.size,
      filename: `merchant-${row.merchantId}-export-${row.id}.zip`,
    };
  }

  resolveFilePath(relativePath: string): string {
    return join(this.config.storageDir, relativePath);
  }

  /** Internal: mark a row in-progress. Called by the processor. */
  markProcessing(exportId: string): Promise<MerchantExport> {
    return this.prisma.merchantExport.update({
      where: { id: exportId },
      data: {
        status: MerchantExportStatus.PROCESSING,
        startedAt: new Date(),
      },
    });
  }

  markReady(
    exportId: string,
    data: {
      filePath: string;
      fileBytes: number;
      invoiceCount: number;
      receiptCount: number;
      inventoryCount: number;
      buyerCount: number;
    },
  ): Promise<MerchantExport> {
    return this.prisma.merchantExport.update({
      where: { id: exportId },
      data: {
        ...data,
        status: MerchantExportStatus.READY,
        completedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  markFailed(exportId: string, error: string): Promise<MerchantExport> {
    return this.prisma.merchantExport.update({
      where: { id: exportId },
      data: {
        status: MerchantExportStatus.FAILED,
        completedAt: new Date(),
        errorMessage: error.slice(0, 500),
      },
    });
  }

  /** Sweep READY exports past their expiresAt: delete the file on disk and
   *  flip the row to EXPIRED. Idempotent — missing files are treated as
   *  already gone. */
  async expireOldBundles(): Promise<number> {
    const stale = await this.prisma.merchantExport.findMany({
      where: {
        status: MerchantExportStatus.READY,
        expiresAt: { lt: new Date() },
      },
      select: { id: true, filePath: true },
    });
    let expired = 0;
    for (const row of stale) {
      if (row.filePath) {
        try {
          await unlink(this.resolveFilePath(row.filePath));
        } catch (err) {
          this.logger.warn(
            `expire ${row.id}: file already gone (${(err as Error).message})`,
          );
        }
      }
      await this.prisma.merchantExport.update({
        where: { id: row.id },
        data: { status: MerchantExportStatus.EXPIRED, filePath: null },
      });
      expired += 1;
    }
    return expired;
  }

  private async assertMerchantExists(merchantId: string): Promise<void> {
    const found = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException(`Merchant ${merchantId} not found`);
  }

  private assertOwnMerchant(merchantId: string): void {
    const ctx = this.context.get();
    // Fail-closed: only SUPER_ADMIN bypasses the merchant scope check.
    if (ctx?.actorRole === 'SUPER_ADMIN') return;
    if (!ctx?.merchantId || ctx.merchantId !== merchantId) {
      throw new ForbiddenException(
        "You can only export your own merchant's data.",
      );
    }
  }
}
