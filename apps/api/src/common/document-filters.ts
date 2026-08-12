import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * One filter vocabulary for every document list — invoices, receipts, the
 * withholding register. Deliberately shared: three lists that filter three
 * different ways is how a reporting UI becomes unlearnable.
 */
export class DocumentFilterDto {
  @ApiPropertyOptional({ description: 'Inclusive start date (ISO).' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive end date (ISO).' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({
    description: 'Free text over the counterparty — legal name or TIN.',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    enum: ['branch', 'merchant'],
    description:
      "Default 'branch'. MERCHANT_ADMIN may pass 'merchant' to span every branch.",
  })
  @IsOptional()
  @IsIn(['branch', 'merchant'])
  scope?: 'branch' | 'merchant';

  @ApiPropertyOptional({
    enum: ['PAID', 'UNPAID', 'PARTIAL', 'CANCELLED'],
    description: 'Document status. Vocabulary is per-module; unknown values are ignored.',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    enum: ['SALES', 'WITHHOLD'],
    description: 'Receipts only — sales receipt or withholding receipt.',
  })
  @IsOptional()
  @IsIn(['SALES', 'WITHHOLD'])
  kind?: 'SALES' | 'WITHHOLD';

  @ApiPropertyOptional({ description: 'Opaque cursor from the previous page.' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  /** Rows matching the filter, ignoring pagination. */
  total: number;
}

export const DEFAULT_PAGE = 50;
export const MAX_PAGE = 200;

export function pageSize(limit?: number): number {
  return Math.min(Math.max(limit ?? DEFAULT_PAGE, 1), MAX_PAGE);
}

/**
 * `to` is treated as the whole of that day. A user filtering "to 19 July"
 * means through the end of the 19th, not 00:00 — getting this wrong silently
 * drops a day's documents from every report.
 */
export function dateRange(
  from?: string,
  to?: string,
): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  const range: { gte?: Date; lte?: Date } = {};
  if (from) range.gte = new Date(from);
  if (to) {
    const end = new Date(to);
    // Date-only input parses to midnight UTC; widen to end-of-day. A full
    // timestamp is taken as given.
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) end.setUTCHours(23, 59, 59, 999);
    range.lte = end;
  }
  return range;
}

/** Cursor pagination args. Ordering must include a unique tiebreak or a
 *  cursor can skip rows that share a timestamp. */
export function cursorArgs(cursor: string | undefined, take: number) {
  return {
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}

export function toPage<T extends { id: string }>(
  rows: T[],
  take: number,
  total: number,
): Page<T> {
  const items = rows.slice(0, take);
  return {
    items,
    nextCursor: rows.length > take ? (items[items.length - 1]?.id ?? null) : null,
    total,
  };
}
