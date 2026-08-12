import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { RequestContextService } from '../../audit/request-context.service';
import { REQUIRE_TURNSTILE_KEY } from './require-turnstile.decorator';
import { TurnstileService } from './turnstile.service';

@Injectable()
export class TurnstileGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly turnstile: TurnstileService,
    private readonly context: RequestContextService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_TURNSTILE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required) return true;
    if (!this.turnstile.enabled) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const body = req.body as { turnstileToken?: unknown } | undefined;
    const token =
      typeof body?.turnstileToken === 'string'
        ? body.turnstileToken
        : undefined;
    const result = await this.turnstile.verify(token, req.ip);
    this.context.setChallenge({
      provided: Boolean(token),
      verified: result.ok,
      errorCodes: result.ok ? undefined : result.errorCodes,
    });
    if (result.ok) return true;
    if (
      result.reason === 'transport-error' ||
      result.reason === 'misconfigured'
    ) {
      throw new ServiceUnavailableException(
        'Verification service is unavailable. Please try again in a moment.',
      );
    }
    throw new ForbiddenException(
      'Verification failed. Please complete the challenge and try again.',
    );
  }
}
