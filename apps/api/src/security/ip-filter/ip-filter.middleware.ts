import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

import { type CidrRange, ipInRanges, parseCidrList } from './ip-cidr';

/**
 * Region-based access filter. Two independent CIDR lists:
 *
 *   IP_ALLOW_LIST     — when non-empty, ONLY IPs in this set are allowed.
 *   IP_DISALLOW_LIST  — always blocked, wins over allow (safety default).
 *
 * Empty lists = no filter. Behaviour on parse error: entry is logged and
 * ignored, the rest of the list still applies. Never fails-open on config
 * error unless BOTH lists parse empty.
 *
 * Returns HTTP 451 (Unavailable For Legal Reasons) with a structured body
 * so the SPA can render a "not available in your region" screen instead of
 * a raw error.
 */
@Injectable()
export class IpFilterMiddleware implements NestMiddleware {
  private readonly logger = new Logger(IpFilterMiddleware.name);
  private readonly allow: CidrRange[];
  private readonly disallow: CidrRange[];
  private readonly enabled: boolean;

  constructor(config: ConfigService) {
    const allowParse = parseCidrList(config.get<string>('IP_ALLOW_LIST'));
    const denyParse = parseCidrList(config.get<string>('IP_DISALLOW_LIST'));
    for (const e of allowParse.errors) {
      this.logger.error(`IP_ALLOW_LIST entry ignored — ${e}`);
    }
    for (const e of denyParse.errors) {
      this.logger.error(`IP_DISALLOW_LIST entry ignored — ${e}`);
    }
    this.allow = allowParse.ranges;
    this.disallow = denyParse.ranges;
    this.enabled = this.allow.length > 0 || this.disallow.length > 0;
    if (this.enabled) {
      this.logger.log(
        `IP filter enabled — allow ${this.allow.length} range(s), deny ${this.disallow.length} range(s).`,
      );
    }
  }

  use(req: Request, res: Response, next: NextFunction): void {
    if (!this.enabled) return next();
    const ip = clientIp(req);
    if (!ip) {
      // No usable client IP (e.g. Unix socket, or trust-proxy misconfigured).
      // Fail-closed only if the allow-list is non-empty.
      if (this.allow.length > 0) return this.reject(res, 'unknown');
      return next();
    }
    if (ipInRanges(ip, this.disallow)) {
      return this.reject(res, ip);
    }
    if (this.allow.length > 0 && !ipInRanges(ip, this.allow)) {
      return this.reject(res, ip);
    }
    return next();
  }

  private reject(res: Response, ip: string): void {
    this.logger.warn(`IP filter blocked ${ip}.`);
    res.status(451).json({
      statusCode: 451,
      reasonCode: 'REGION_BLOCKED',
      message: 'Service is not available in your region.',
      userMessages: [
        'This service is currently unavailable for your region. If you believe this is a mistake, contact support.',
      ],
    });
  }
}

/** Best-effort client IP resolution. Trusts X-Forwarded-For only when
 *  Express's `trust proxy` setting is on (bootstrap enables it via
 *  TRUSTED_PROXY_HOPS). Otherwise falls back to the socket address. */
function clientIp(req: Request): string | null {
  const candidate = req.ip ?? req.socket?.remoteAddress ?? null;
  if (!candidate) return null;
  // Normalise IPv4-mapped IPv6 (::ffff:1.2.3.4 → 1.2.3.4) here as a
  // convenience for the log line; ipInRanges does its own normalisation.
  const m = candidate.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return m ? m[1] : candidate;
}
