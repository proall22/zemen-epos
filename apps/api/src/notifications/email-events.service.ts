import { Injectable, Logger } from '@nestjs/common';

import { MetricsService } from '../observability/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { domainOf, isConsumerDomain } from './email-domain';

export interface SentEmail {
  providerId: string;
  recipient: string;
  subject: string;
}

@Injectable()
export class EmailEventsService {
  private readonly logger = new Logger(EmailEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  async recordSent(input: SentEmail): Promise<void> {
    const domain = domainOf(input.recipient) ?? 'unknown';
    await this.prisma.emailEvent.upsert({
      where: { providerId: input.providerId },
      create: {
        providerId: input.providerId,
        recipient: input.recipient,
        recipientDomain: domain,
        subject: input.subject,
        status: 'sent',
      },
      update: {},
    });
    this.metrics.emailSentTotal
      .labels(domain, isConsumerDomain(domain) ? 'consumer' : 'corporate')
      .inc();
  }

  async applyWebhook(event: {
    type: string;
    providerId: string;
    at: Date;
    reason?: string;
  }): Promise<void> {
    const row = await this.prisma.emailEvent.findUnique({
      where: { providerId: event.providerId },
    });
    if (!row) {
      this.logger.debug(
        `Ignoring webhook for unknown providerId=${event.providerId} type=${event.type} (not one of ours)`,
      );
      return;
    }
    const nextStatus = mapWebhookType(event.type);
    if (!nextStatus) return;
    await this.prisma.emailEvent.update({
      where: { providerId: event.providerId },
      data: {
        status: nextStatus,
        deliveredAt:
          nextStatus === 'delivered' ? event.at : row.deliveredAt,
        openedAt: nextStatus === 'opened' ? event.at : row.openedAt,
        bouncedAt: nextStatus === 'bounced' ? event.at : row.bouncedAt,
        complainedAt:
          nextStatus === 'complained' ? event.at : row.complainedAt,
        bounceReason:
          nextStatus === 'bounced' ? event.reason ?? null : row.bounceReason,
      },
    });
    this.metrics.emailWebhookTotal
      .labels(
        nextStatus,
        row.recipientDomain,
        isConsumerDomain(row.recipientDomain) ? 'consumer' : 'corporate',
      )
      .inc();
  }
}

function mapWebhookType(type: string): string | null {
  switch (type) {
    case 'email.delivered':
      return 'delivered';
    case 'email.opened':
      return 'opened';
    case 'email.bounced':
      return 'bounced';
    case 'email.complained':
      return 'complained';
    default:
      return null;
  }
}
