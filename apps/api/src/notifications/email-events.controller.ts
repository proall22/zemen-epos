import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../auth/require-permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { isConsumerDomain } from './email-domain';

interface DomainRow {
  domain: string;
  kind: 'consumer' | 'corporate';
  sent: number;
  delivered: number;
  opened: number;
  bounced: number;
  complained: number;
  deliverabilityRate: number;
  bounceRate: number;
}

@ApiTags('EmailEvents')
@Controller('email-events')
export class EmailEventsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('deliverability.view')
  @ApiOperation({
    summary:
      'Recent outbound emails with their Resend webhook state. Latest 200. Filter by ?domain= / ?status=.',
  })
  async recent(
    @Query('domain') domain?: string,
    @Query('status') status?: string,
  ) {
    return this.prisma.emailEvent.findMany({
      where: {
        ...(domain ? { recipientDomain: domain.toLowerCase() } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        providerId: true,
        recipient: true,
        recipientDomain: true,
        subject: true,
        status: true,
        bouncedAt: true,
        complainedAt: true,
        deliveredAt: true,
        openedAt: true,
        bounceReason: true,
        createdAt: true,
      },
    });
  }

  @Get('by-domain')
  @RequirePermissions('deliverability.view')
  @ApiOperation({
    summary:
      'Deliverability summary by domain, last 30 days. Sorted by bounce rate then volume.',
  })
  async byDomain(): Promise<DomainRow[]> {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const rows = await this.prisma.emailEvent.groupBy({
      by: ['recipientDomain', 'status'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });
    const byDomain = new Map<string, DomainRow>();
    for (const r of rows) {
      const key = r.recipientDomain;
      const existing = byDomain.get(key) ?? emptyRow(key);
      const count = r._count._all;
      existing.sent += count;
      if (r.status === 'delivered') existing.delivered += count;
      if (r.status === 'opened') {
        existing.opened += count;
        existing.delivered += count;
      }
      if (r.status === 'bounced') existing.bounced += count;
      if (r.status === 'complained') existing.complained += count;
      byDomain.set(key, existing);
    }
    for (const row of byDomain.values()) {
      row.deliverabilityRate = row.sent ? row.delivered / row.sent : 0;
      row.bounceRate = row.sent ? row.bounced / row.sent : 0;
    }
    return Array.from(byDomain.values()).sort(
      (a, b) => b.bounceRate - a.bounceRate || b.sent - a.sent,
    );
  }
}

function emptyRow(domain: string): DomainRow {
  return {
    domain,
    kind: isConsumerDomain(domain) ? 'consumer' : 'corporate',
    sent: 0,
    delivered: 0,
    opened: 0,
    bounced: 0,
    complained: 0,
    deliverabilityRate: 0,
    bounceRate: 0,
  };
}
