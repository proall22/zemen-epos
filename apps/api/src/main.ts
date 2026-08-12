// Must be the first import — Sentry patches modules before NestJS loads them.
import './instrument';

import { randomUUID, timingSafeEqual } from 'node:crypto';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { RequestContextService } from './audit/request-context.service';

async function bootstrap() {
  // Typed as NestExpressApplication so we can call useBodyParser without
  // having to import the `express` package directly — keeping express out
  // of our declared deps avoids a "Cannot find module 'express'" runtime
  // crash in pnpm's isolated production node_modules layout.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const log = new Logger('Bootstrap');

  // Trust the reverse-proxy chain for `req.ip` + rate-limit tracker keys.
  // 0 (default) trusts nothing; 1 for a single nginx / traefik hop; higher
  // for chained (CDN → LB → nginx → app).
  const proxyHops = Number(process.env.TRUSTED_PROXY_HOPS ?? 0);
  if (proxyHops > 0) {
    app.set('trust proxy', proxyHops);
    log.log(`Trusting ${proxyHops} reverse-proxy hop(s) for req.ip.`);
  }

  // Flush buffered Sentry events on shutdown.
  app.enableShutdownHooks();

  // Security headers. Nest serves a pure JSON API (no inline scripts or
  // styles), so helmet's defaults — HSTS (prod-only), X-Content-Type-Options,
  // X-DNS-Prefetch-Control, X-Download-Options, X-Frame-Options DENY, CSP
  // (default-src 'none' plus frame-ancestors 'none'), Referrer-Policy
  // no-referrer — are all safe to leave on. We don't render HTML responses
  // from the API, so we don't need any of the loosened CSP modes.
  app.use(helmet());

  // Explicit body-size cap. Express's default is 100 KB, which is plenty for
  // our DTOs (the biggest realistic payload is a memo with a few dozen line
  // items — well under 100 KB). 256 KB leaves headroom while still
  // refusing the multi-MB blob a misbehaving / malicious client might send.
  // Same cap on urlencoded for completeness (we don't take form posts, but
  // ValidationPipe will reject unknown fields anyway). Use Nest's typed
  // useBodyParser rather than importing express directly — see the
  // NestExpressApplication note above.
  app.useBodyParser('json', { limit: '256kb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '256kb' });

  // Parse cookies before any controller — refresh token rides in a HttpOnly
  // cookie, and the @nestjs/throttler tracker may want to read others later.
  // The cookie-parser secret is unused (we don't sign cookies; the refresh
  // token is opaque + DB-backed), so pass undefined.
  app.use(cookieParser());

  // Open an AsyncLocalStorage context per request (before Nest routing) so the
  // audit interceptor's actor propagates to deep outbound EIRMS calls. Plain
  // Express middleware avoids Express-5 route-wildcard pitfalls; it uses the DI
  // singleton so it shares the same store the rest of the app reads.
  const requestContext = app.get(RequestContextService);
  app.use((req: Request, _res: Response, next: NextFunction) => {
    requestContext.run(
      {
        requestId: randomUUID(),
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
      () => next(),
    );
  });

  // CORS — the env supports both exact origin strings and regex patterns
  // (prefix any pattern with `re:`). Examples:
  //   CORS_ORIGINS="https://app.epay.et,re:^https://[^.]+\\.preview\\.epay\\.et$"
  // matches the production hostname exactly plus any single-label preview
  // subdomain. Comma-separated, leading/trailing whitespace trimmed.
  app.enableCors({
    origin: buildCorsOriginChecker(process.env.CORS_ORIGINS, log),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger is mounted ONLY when both SWAGGER_USER and SWAGGER_PASS are set
  // in the environment. Either being missing keeps /api/docs entirely
  // unmounted — the route 404s — so a production deployment that forgets the
  // creds simply hides the docs rather than leaking them.
  const swaggerLogger = new Logger('SwaggerDocs');
  const swaggerUser = process.env.SWAGGER_USER;
  const swaggerPass = process.env.SWAGGER_PASS;
  if (swaggerUser && swaggerPass) {
    app.use('/api/docs', swaggerBasicAuth(swaggerUser, swaggerPass));
    const config = new DocumentBuilder()
      .setTitle('EIRMS × Zemen-ePos API')
      .setDescription('EIRMS × Zemen-ePos service API documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    swaggerLogger.log('Swagger UI mounted at /api/docs (Basic Auth required).');
  } else {
    swaggerLogger.log(
      'SWAGGER_USER / SWAGGER_PASS not set — /api/docs disabled.',
    );
  }

  // Slow-client defenses on the underlying http server. Defaults in Node 20
  // are too generous for an internet-facing API (5 min request timeout, no
  // headers timeout cap) — Slowloris-style attackers can hold thousands of
  // sockets open. The numbers:
  //   - `headersTimeout` 10s — a legit client always finishes its headers
  //     well inside a second; anything slower is either broken or hostile.
  //   - `requestTimeout` 60s — EIRMS round-trips can be ~10–20s; 60s leaves
  //     margin without letting a request hang forever.
  //   - `keepAliveTimeout` 5s — close idle keep-alive sockets so a stuck
  //     client doesn't pin a connection slot indefinitely.
  const server = app.getHttpServer();
  server.headersTimeout = 10_000;
  server.requestTimeout = 60_000;
  server.keepAliveTimeout = 5_000;

  await app.listen(process.env.PORT ?? 4899);
}
bootstrap();

/**
 * Plain Express middleware enforcing HTTP Basic Auth for the Swagger UI.
 * Constant-time credential comparison so the request takes the same number
 * of CPU cycles whether the user or the password is wrong — equivalent to
 * the protections on the main login flow. Header challenge prompts the
 * browser's built-in Basic-Auth dialog on the first hit.
 */
function swaggerBasicAuth(user: string, pass: string) {
  const expected = Buffer.from(`${user}:${pass}`);
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Zemen-ePos API Docs"');
      res.status(401).send('Authentication required.');
      return;
    }
    let supplied: Buffer;
    try {
      supplied = Buffer.from(header.slice(6), 'base64');
    } catch {
      res.status(400).send('Malformed credentials.');
      return;
    }
    // timingSafeEqual requires equal-length buffers; pad-or-truncate first
    // by xor'ing into a fixed-size workspace so the eq runs in constant time
    // regardless of input shape.
    const max = Math.max(expected.length, supplied.length);
    const a = Buffer.alloc(max);
    const b = Buffer.alloc(max);
    expected.copy(a);
    supplied.copy(b);
    const eq = timingSafeEqual(a, b) && expected.length === supplied.length;
    if (eq) {
      next();
    } else {
      res.setHeader('WWW-Authenticate', 'Basic realm="Zemen-ePos API Docs"');
      res.status(401).send('Invalid credentials.');
    }
  };
}

/**
 * Compile the CORS_ORIGINS env into a function the @nestjs/cors layer can
 * call per request. The env is a comma-separated list of entries; each
 * entry is either an exact origin or a regex pattern prefixed with `re:`.
 * Invalid regex patterns are logged and ignored — they don't take the API
 * down at boot.
 *
 * Requests without an Origin header (curl, server-to-server, same-origin
 * navigations) are allowed: CORS is a browser-enforced contract, and
 * blocking the request on the server side here would only hurt diagnostics.
 *
 * Empty CORS_ORIGINS produces a deny-all checker — fail-closed so a
 * misconfigured production deployment can't accidentally accept arbitrary
 * cross-origin browser requests.
 */
type CorsOriginCheck = (
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean) => void,
) => void;

function buildCorsOriginChecker(
  envVar: string | undefined,
  log: Logger,
): CorsOriginCheck {
  const entries = (envVar ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const exact = new Set<string>();
  const patterns: RegExp[] = [];

  for (const entry of entries) {
    if (entry.startsWith('re:')) {
      const expr = entry.slice(3);
      try {
        patterns.push(new RegExp(expr));
      } catch (err) {
        log.error(
          `Invalid CORS regex pattern "${expr}": ${(err as Error).message} — entry ignored.`,
        );
      }
    } else {
      exact.add(entry);
    }
  }

  if (exact.size === 0 && patterns.length === 0) {
    log.warn(
      'CORS_ORIGINS is empty — denying all cross-origin browser requests.',
    );
  } else {
    log.log(
      `CORS allow-list: ${exact.size} exact origin${exact.size === 1 ? '' : 's'} + ${patterns.length} regex pattern${patterns.length === 1 ? '' : 's'}.`,
    );
  }

  return (origin, cb) => {
    // No Origin header → non-browser request. Allow it; CORS rules exist to
    // protect browsers, not server-to-server callers.
    if (!origin) return cb(null, true);
    if (exact.has(origin)) return cb(null, true);
    for (const pattern of patterns) {
      if (pattern.test(origin)) return cb(null, true);
    }
    log.debug(`CORS rejected origin "${origin}".`);
    cb(null, false);
  };
}
