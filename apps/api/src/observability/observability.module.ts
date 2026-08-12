import {
  Global,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { HttpMetricsMiddleware } from './http-metrics.middleware';
import { metricsConfig } from './metrics.config';
import { MetricsBasicAuthGuard } from './metrics-basic-auth.guard';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

/**
 * Owns the Prometheus exposition endpoint + the HTTP metrics middleware.
 *
 * Registers `HttpMetricsMiddleware` against every route (`*`) so all
 * tenant traffic is counted — including paths handled by other modules.
 * The middleware short-circuits on `/metrics` to avoid recursion.
 */
@Global()
@Module({
  imports: [ConfigModule.forFeature(metricsConfig)],
  controllers: [MetricsController],
  providers: [MetricsService, MetricsBasicAuthGuard],
  exports: [MetricsService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpMetricsMiddleware).forRoutes('*');
  }
}
