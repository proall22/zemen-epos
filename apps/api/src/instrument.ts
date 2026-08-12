import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

// Initialised before any other import (see main.ts) so OTel can patch
// http/express/ioredis/prisma first. Reads process.env directly — ConfigModule
// hasn't loaded .env at this point. The DSN isn't secret; SENTRY_DSN overrides.
const dsn =
  process.env.SENTRY_DSN ||
  'https://e7b55d6acc9e302c3e9dcc233592fe1b@sentry.internal.vas.et/9';

const envName =
  process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production';

const num = (v: string | undefined, fallback: number) =>
  v !== undefined && v !== '' ? Number(v) : fallback;

// Default to a 10% sample; override per env. Health probes are dropped below.
const tracesSampleRate = num(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1);
const profileSessionSampleRate = num(
  process.env.SENTRY_PROFILES_SAMPLE_RATE,
  0.1,
);

Sentry.init({
  dsn,
  environment: envName,
  release: process.env.SENTRY_RELEASE,
  sendDefaultPii: true,

  // Tracing. tracesSampler lets us drop k8s health probes (high volume, zero
  // signal) while sampling everything else at tracesSampleRate.
  tracesSampler: (ctx) => {
    const name = ctx.name ?? '';
    if (name.includes('/healthz') || name.includes('/livez')) return 0;
    return tracesSampleRate;
  },

  // CPU profiling tied to sampled traces (needs @sentry/profiling-node).
  profileSessionSampleRate,
  profileLifecycle: 'trace',

  integrations: [
    nodeProfilingIntegration(),
    // Prisma spans aren't auto-enabled.
    Sentry.prismaIntegration(),
    // Forward Nest's Logger / console output to Sentry Logs.
    Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] }),
  ],

  enableLogs: true,
});
