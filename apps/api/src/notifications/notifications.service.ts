import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  NOTIFICATIONS_QUEUE,
  NotificationJob,
  SMS_QUEUE,
  notificationJobId,
} from './notifications.types';

/** Injected by other modules. The dynamic module binds either the queue-backed
 *  implementation or a no-op (when notifications are disabled). */
export abstract class NotificationsService {
  abstract enqueue(job: NotificationJob): Promise<void>;
}

@Injectable()
export class QueueNotificationsService extends NotificationsService {
  private readonly logger = new Logger(QueueNotificationsService.name);

  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
    // Present only when SMS_ENABLED — the SMS queue isn't registered otherwise.
    @Optional()
    @InjectQueue(SMS_QUEUE)
    private readonly smsQueue?: Queue,
  ) {
    super();
  }

  async enqueue(job: NotificationJob): Promise<void> {
    await this.add(this.queue, job, notificationJobId(job));
    if (this.smsQueue) {
      await this.add(this.smsQueue, job, `sms__${notificationJobId(job)}`);
    }
  }

  /** Enqueue one channel's job. A queue/Redis hiccup must never break the
   *  action that triggered the notification, so failures are logged, not thrown. */
  private async add(queue: Queue, job: NotificationJob, jobId: string): Promise<void> {
    try {
      await queue.add(job.action, job, {
        jobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: 100,
      });
    } catch (err) {
      this.logger.error(
        `Failed to enqueue ${job.action} on ${queue.name}: ${(err as Error).message}`,
      );
    }
  }
}

@Injectable()
export class NoopNotificationsService extends NotificationsService {
  async enqueue(): Promise<void> {
    /* notifications disabled */
  }
}
