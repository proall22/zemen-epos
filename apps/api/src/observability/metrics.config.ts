import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export interface MetricsConfig {
  /** Basic-auth user that Prometheus presents on each scrape. */
  user: string;
  /** Basic-auth password that Prometheus presents on each scrape. */
  password: string;
}

export const metricsConfig = registerAs<MetricsConfig>('metrics', () => ({
  user: process.env.METRICS_USER!,
  password: process.env.METRICS_PASS!,
}));

export const metricsValidationSchema = {
  // Defaults match observability/prometheus/prometheus.yml so a freshly
  // cloned dev stack works out of the box. Override in prod.
  METRICS_USER: Joi.string().min(1).default('metrics'),
  METRICS_PASS: Joi.string().min(1).default('metrics'),
};
