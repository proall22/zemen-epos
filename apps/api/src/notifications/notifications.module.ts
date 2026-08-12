import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { eirmsConfig } from '../eirms/eirms.config';
import { EmailEventsController } from './email-events.controller';
import { EmailEventsService } from './email-events.service';
import { EmailRenderer } from './email-renderer';
import { NotificationsI18nService } from './i18n';
import { notificationsConfig } from './notifications.config';
import { NotificationsProcessor } from './notifications.processor';
import {
  NoopNotificationsService,
  NotificationsService,
  QueueNotificationsService,
} from './notifications.service';
import { NOTIFICATIONS_QUEUE, SMS_QUEUE } from './notifications.types';
import { ResendClient } from './resend.client';
import { SmsClient } from './sms.client';
import { SmsProcessor } from './sms.processor';
import { WebhooksController } from './webhooks.controller';

@Module({})
export class NotificationsModule {
  static register(): DynamicModule {
    // Feature flag is read here (before ConfigModule validation) so that when
    // notifications are off we never wire up BullMQ — keeping Redis optional
    // for local dev and tests.
    const enabled = process.env.NOTIFICATIONS_ENABLED === 'true';

    if (!enabled) {
      return {
        module: NotificationsModule,
        global: true,
        controllers: [WebhooksController, EmailEventsController],
        providers: [
          { provide: NotificationsService, useClass: NoopNotificationsService },
          NotificationsI18nService,
          EmailEventsService,
        ],
        exports: [
          NotificationsService,
          NotificationsI18nService,
          EmailEventsService,
        ],
      };
    }

    // SMS is an independently-toggled channel on its own queue. Wire it up only
    // when enabled so email-only deployments don't need the gateway creds.
    const smsEnabled = process.env.SMS_ENABLED === 'true';

    return {
      module: NotificationsModule,
      global: true,
      imports: [
        ConfigModule.forFeature(notificationsConfig),
        ConfigModule.forFeature(eirmsConfig),
        // Bull connection is now wired at the app root via BullSetupModule
        // (shared with the drafts-sync worker in InvoicesModule). This
        // module only registers its own queues against it.
        BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }),
        ...(smsEnabled
          ? [HttpModule.register({ timeout: 15_000 }), BullModule.registerQueue({ name: SMS_QUEUE })]
          : []),
      ],
      controllers: [WebhooksController, EmailEventsController],
      providers: [
        { provide: NotificationsService, useClass: QueueNotificationsService },
        NotificationsProcessor,
        EmailRenderer,
        NotificationsI18nService,
        ResendClient,
        EmailEventsService,
        ...(smsEnabled ? [SmsProcessor, SmsClient] : []),
      ],
      exports: [
        NotificationsService,
        NotificationsI18nService,
        EmailEventsService,
      ],
    };
  }
}
