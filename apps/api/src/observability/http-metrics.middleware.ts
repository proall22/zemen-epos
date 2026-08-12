import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { MetricsService } from './metrics.service';

/**
 * Records one increment + one histogram observation per request. The route
 * label is taken from Express's matched route template (e.g.
 * `/merchants/:id/branches`) instead of the raw path, so high-cardinality
 * ids don't blow up the metric series count. `/metrics` itself is skipped
 * to avoid self-amplification on every scrape.
 */
@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (req.path === '/metrics') {
      next();
      return;
    }
    const startNs = process.hrtime.bigint();
    res.on('finish', () => {
      const durationSeconds =
        Number(process.hrtime.bigint() - startNs) / 1_000_000_000;
      // `req.route` is populated by Express once a handler is matched; on
      // 404s it's undefined, so we fall back to a constant string instead of
      // labelling with the raw path (which would explode the series count).
      const route =
        (req.route as { path?: string } | undefined)?.path ??
        (req.baseUrl ? `${req.baseUrl}/*` : 'unmatched');
      const labels = {
        method: req.method,
        route,
        status_code: String(res.statusCode),
      };
      this.metrics.httpRequestsTotal.inc(labels);
      this.metrics.httpRequestDurationSeconds.observe(labels, durationSeconds);
    });
    next();
  }
}
