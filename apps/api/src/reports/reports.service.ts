import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { Prisma, ScheduledReport, ScheduledReportRun } from '@prisma/client';

import { RequestContextService } from '../audit/request-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { computeNextRunAt, isValidTimeZone } from '../common/local-time';
import { reportsConfig } from './reports.config';
import { ReportsAggregationService } from './reports-aggregation.service';
import type { CreateScheduledReportDto } from './dto/create-scheduled-report.dto';
import type { PreviewReportDto } from './dto/preview-report.dto';
import type { UpdateScheduledReportDto } from './dto/update-scheduled-report.dto';
import type { ReportPayload } from './reports.types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly aggregation: ReportsAggregationService,
    @Inject(reportsConfig.KEY)
    private readonly config: ConfigType<typeof reportsConfig>,
  ) {}

  async list(merchantId: string): Promise<ScheduledReport[]> {
    this.assertOwnMerchant(merchantId);
    const branchId = this.branchAdminBranchId();
    return this.prisma.scheduledReport.findMany({
      where: { merchantId, ...(branchId ? { branchId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(merchantId: string, reportId: string): Promise<ScheduledReport> {
    this.assertOwnMerchant(merchantId);
    return this.findOwned(merchantId, reportId);
  }

  async runs(
    merchantId: string,
    reportId: string,
    limit = 50,
  ): Promise<ScheduledReportRun[]> {
    this.assertOwnMerchant(merchantId);
    await this.findOwned(merchantId, reportId);
    return this.prisma.scheduledReportRun.findMany({
      where: { reportId, merchantId },
      orderBy: { scheduledFor: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  async create(
    merchantId: string,
    dto: CreateScheduledReportDto,
  ): Promise<ScheduledReport> {
    this.assertOwnMerchant(merchantId);
    const shape = await this.validateShape(merchantId, dto);
    const ctx = this.context.get();
    const now = new Date();

    // Count and insert share a transaction, or two concurrent creates at the
    // boundary both pass.
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.scheduledReport.count({ where: { merchantId } });
      if (existing >= this.config.maxPerMerchant) {
        throw new BadRequestException(
          `This merchant already has ${existing} of ${this.config.maxPerMerchant} scheduled reports. Delete one before adding another.`,
        );
      }

      const draft = {
        scheduleKind: dto.scheduleKind,
        intervalHours: shape.intervalHours,
        dailyAtMinute: shape.dailyAtMinute,
        timezone: shape.timezone,
      };

      return tx.scheduledReport.create({
        data: {
          merchantId,
          name: dto.name.trim(),
          active: dto.active ?? true,
          ...draft,
          branchScope: shape.branchScope,
          branchId: shape.branchId,
          sections: dto.sections,
          recipients: shape.recipients,
          language: dto.language ?? 'en',
          deliveredThrough: now, // no backfill; reports from creation onward
          nextRunAt: computeNextRunAt(draft, now),
          createdBy: ctx?.actorId ?? null,
          createdByEmail: ctx?.actorEmail ?? null,
        },
      });
    });
  }

  async update(
    merchantId: string,
    reportId: string,
    dto: UpdateScheduledReportDto,
  ): Promise<ScheduledReport> {
    this.assertOwnMerchant(merchantId);
    const current = await this.findOwned(merchantId, reportId);

    const merged = {
      scheduleKind: dto.scheduleKind ?? current.scheduleKind,
      intervalHours: dto.intervalHours ?? current.intervalHours ?? undefined,
      dailyAtMinute: dto.dailyAtMinute ?? current.dailyAtMinute ?? undefined,
      timezone: dto.timezone ?? current.timezone,
      branchScope: dto.branchScope ?? current.branchScope,
      branchId: dto.branchId ?? current.branchId ?? undefined,
      sections: dto.sections ?? current.sections,
      recipients: dto.recipients ?? current.recipients,
      language: dto.language ?? current.language,
      name: dto.name ?? current.name,
      active: dto.active ?? current.active,
    };
    const shape = await this.validateShape(
      merchantId,
      merged as CreateScheduledReportDto,
    );

    // Unused half of the schedule is null in the row, undefined in a partial
    // DTO; treating those as different re-arms nextRunAt on a no-op edit.
    const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
    const scheduleChanged =
      !same(merged.scheduleKind, current.scheduleKind) ||
      !same(shape.intervalHours, current.intervalHours) ||
      !same(shape.dailyAtMinute, current.dailyAtMinute) ||
      !same(shape.timezone, current.timezone);

    return this.prisma.scheduledReport.update({
      where: { id: reportId },
      data: {
        name: merged.name.trim(),
        active: merged.active,
        scheduleKind: merged.scheduleKind,
        intervalHours: shape.intervalHours,
        dailyAtMinute: shape.dailyAtMinute,
        timezone: shape.timezone,
        branchScope: shape.branchScope,
        branchId: shape.branchId,
        sections: merged.sections,
        recipients: shape.recipients,
        language: merged.language,
        // deliveredThrough is never written here — only a confirmed send
        // may move it.
        ...(scheduleChanged
          ? {
              nextRunAt: computeNextRunAt(
                {
                  scheduleKind: merged.scheduleKind,
                  intervalHours: shape.intervalHours,
                  dailyAtMinute: shape.dailyAtMinute,
                  timezone: shape.timezone,
                },
                new Date(),
              ),
            }
          : {}),
      },
    });
  }

  async remove(merchantId: string, reportId: string): Promise<void> {
    this.assertOwnMerchant(merchantId);
    await this.findOwned(merchantId, reportId);
    await this.prisma.scheduledReport.delete({ where: { id: reportId } });
  }

  /** Marks the report due; the next tick claims it. Going through the claim
   *  rather than enqueueing directly is what stops a manual run racing the
   *  scheduler into a double send. */
  async runNow(
    merchantId: string,
    reportId: string,
  ): Promise<{ queued: boolean }> {
    this.assertOwnMerchant(merchantId);
    const report = await this.findOwned(merchantId, reportId);
    if (!report.active) {
      throw new BadRequestException('This report is paused.');
    }
    await this.prisma.scheduledReport.update({
      where: { id: reportId },
      data: { nextRunAt: new Date() },
    });
    return { queued: true };
  }

  /** Sends nothing, moves no watermark. */
  async preview(
    merchantId: string,
    dto: PreviewReportDto,
  ): Promise<ReportPayload> {
    this.assertOwnMerchant(merchantId);
    const start = new Date(dto.from);
    const end = new Date(dto.to);
    if (!(start < end)) {
      throw new BadRequestException('`from` must be earlier than `to`.');
    }
    const branchId =
      dto.branchScope === 'SINGLE_BRANCH' ? dto.branchId : undefined;
    if (branchId) await this.assertBranchOwned(merchantId, branchId);

    return this.aggregation.build(
      { merchantId, branchId },
      { start, end },
      dto.sections,
    );
  }

  limits(): { maxRecipients: number; maxPerMerchant: number } {
    return {
      maxRecipients: this.config.maxRecipients,
      maxPerMerchant: this.config.maxPerMerchant,
    };
  }

  // ---------------------------------------------------------------------

  /** Runs on create and update — a cap checked only at create is walkable. */
  private async validateShape(
    merchantId: string,
    dto: CreateScheduledReportDto,
  ) {
    const timezone = dto.timezone?.trim() || 'Africa/Addis_Ababa';
    if (!isValidTimeZone(timezone)) {
      throw new BadRequestException(`Unknown timezone: ${timezone}`);
    }

    const isInterval = dto.scheduleKind === 'INTERVAL_HOURS';
    const intervalHours = isInterval ? (dto.intervalHours ?? null) : null;
    const dailyAtMinute = isInterval ? null : (dto.dailyAtMinute ?? null);
    if (isInterval && intervalHours === null) {
      throw new BadRequestException('intervalHours is required for INTERVAL_HOURS.');
    }
    if (!isInterval && dailyAtMinute === null) {
      throw new BadRequestException('dailyAtMinute is required for DAILY_AT.');
    }

    const branchScope = dto.branchScope ?? 'MERCHANT_WIDE';
    const restrictedBranchId = this.branchAdminBranchId();
    if (restrictedBranchId && branchScope !== 'SINGLE_BRANCH') {
      throw new ForbiddenException(
        'Branch administrators may create reports only for their assigned branch.',
      );
    }
    const branchId = restrictedBranchId ?? (branchScope === 'SINGLE_BRANCH' ? dto.branchId : undefined);
    if (branchScope === 'SINGLE_BRANCH') {
      if (!branchId) {
        throw new BadRequestException('branchId is required for SINGLE_BRANCH.');
      }
      await this.assertBranchOwned(merchantId, branchId);
    }

    // Dedupe before counting, or case variants buy extra slots.
    const recipients = [
      ...new Set(
        (dto.recipients ?? []).map((r) => r.trim().toLowerCase()).filter(Boolean),
      ),
    ];
    if (recipients.length === 0) {
      throw new BadRequestException('At least one recipient is required.');
    }
    const bad = recipients.find((r) => !EMAIL_RE.test(r));
    if (bad) throw new BadRequestException(`Not a valid email address: ${bad}`);
    if (recipients.length > this.config.maxRecipients) {
      throw new BadRequestException(
        `A report may have at most ${this.config.maxRecipients} recipients; this one has ${recipients.length}.`,
      );
    }

    return {
      timezone,
      intervalHours,
      dailyAtMinute,
      branchScope,
      branchId: branchId ?? null,
      recipients,
    };
  }

  private async findOwned(
    merchantId: string,
    reportId: string,
  ): Promise<ScheduledReport> {
    const row = await this.prisma.scheduledReport.findUnique({
      where: { id: reportId },
    });
    // 404 not 403: a 403 confirms the id exists, making ids enumerable.
    const restrictedBranchId = this.branchAdminBranchId();
    if (!row || row.merchantId !== merchantId || (restrictedBranchId && row.branchId !== restrictedBranchId)) {
      throw new NotFoundException(`Scheduled report ${reportId} not found`);
    }
    return row;
  }

  /** Returns the mandatory branch boundary for a BRANCH_ADMIN request. */
  private branchAdminBranchId(): string | undefined {
    const ctx = this.context.get();
    if (ctx?.actorRole !== 'BRANCH_ADMIN') return undefined;
    if (!ctx.branchId) {
      throw new ForbiddenException('Branch administrator context is missing its assigned branch.');
    }
    return ctx.branchId;
  }

  private async assertBranchOwned(
    merchantId: string,
    branchId: string,
  ): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, merchantId },
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException(`Branch ${branchId} not found`);
    }
  }

  private assertOwnMerchant(merchantId: string): void {
    const ctx = this.context.get();
    // Fail-closed; SUPER_ADMIN reaches this only under a consent grant.
    if (ctx?.actorRole === 'SUPER_ADMIN') return;
    if (!ctx?.merchantId || ctx.merchantId !== merchantId) {
      throw new ForbiddenException(
        "You can only manage your own merchant's reports.",
      );
    }
  }
}
