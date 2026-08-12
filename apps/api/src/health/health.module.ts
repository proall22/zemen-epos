import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/** Liveness + readiness probes for load balancers / k8s. Both endpoints
 *  are `@Public()`; see HealthController. */
@Module({
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
