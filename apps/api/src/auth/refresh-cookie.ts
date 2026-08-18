import type { CookieOptions, Response } from 'express';

import type { IssuedSession, LoginResponse } from './auth.types';
import { REFRESH_TTL_MS } from './refresh-tokens.service';

/** Name of the HttpOnly cookie that carries the refresh token. Scoped to
 *  `/auth/*` (the only endpoints that need it) so it's not echoed on every
 *  API call. */
export const REFRESH_COOKIE_NAME = 'eirms_refresh';

/**
 * Cookie attributes for the refresh token.
 * - `HttpOnly` keeps the value out of `document.cookie`, defending the
 *   refresh token against XSS-driven exfiltration.
 * - `Secure` is enabled in production / when `COOKIE_SECURE=true`; the
 *   browser refuses to send the cookie over plain HTTP in that case.
 * - `SameSite` defaults to `lax`, which works when the SPA and API share
 *   eTLD+1 (e.g. app.epay.et + api.epay.et). For genuinely cross-site
 *   deployments set `COOKIE_SAMESITE=none` and ensure `Secure` is on.
 * - `Path` is configurable because a direct API uses `/auth`, while the
 *   same-origin nginx gateway is browser-visible as `/api/auth`.
 * The `setting=false` variant is used by `res.clearCookie` on logout; the
 * browser only honours `Path` + `SameSite` matches on deletion, hence the
 * same struct sans `maxAge`.
 */
export function refreshCookieOptions(setting: boolean): CookieOptions {
  const sameSite =
    (process.env.COOKIE_SAMESITE as 'lax' | 'strict' | 'none' | undefined) ??
    'lax';
  const explicitSecure = process.env.COOKIE_SECURE;
  const publicUrl = process.env.APP_PUBLIC_URL ?? '';
  const path = process.env.COOKIE_PATH || '/auth';
  const secure =
    explicitSecure === 'true' ||
    (explicitSecure !== 'false' &&
      (publicUrl
        ? publicUrl.startsWith('https://')
        : process.env.NODE_ENV === 'production'));
  return {
    httpOnly: true,
    secure,
    sameSite,
    path,
    ...(setting ? { maxAge: REFRESH_TTL_MS } : {}),
  };
}

/**
 * Drop the refresh token into the HttpOnly cookie and return the public
 * portion of the session as JSON. Used by every endpoint that issues a
 * session (/auth/login, /auth/refresh, /signup/merchant).
 */
export function commitSession(
  session: IssuedSession,
  res: Response,
): LoginResponse {
  res.cookie(
    REFRESH_COOKIE_NAME,
    session.refreshToken,
    refreshCookieOptions(true),
  );
  return {
    token: session.token,
    expiresIn: session.expiresIn,
    user: session.user,
  };
}
