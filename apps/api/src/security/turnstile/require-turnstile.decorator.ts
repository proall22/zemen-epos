import { SetMetadata } from '@nestjs/common';

export const REQUIRE_TURNSTILE_KEY = 'requireTurnstile';

/** Opt a route into Cloudflare Turnstile verification. The global
 *  TurnstileGuard checks for this metadata and short-circuits when absent. */
export const RequireTurnstile = (): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_TURNSTILE_KEY, true);
