export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4899";

export const TOKEN_STORAGE_KEY = "eirms_token";

/** localStorage key for the branch picker. Set by the AppShell's picker for
 *  users without a pinned branch (MERCHANT_ADMIN / ACCOUNTANT / SUPPORT);
 *  attached as `X-Branch-Id` on every API call so writes go to the right
 *  branch. The backend validates the value belongs to the user's merchant. */
export const BRANCH_STORAGE_KEY = "eirms_branch";

/** localStorage key for a SUPER_ADMIN's active consent session. Set when they
 *  "enter" a merchant they hold a live grant for; attached as
 *  `X-Consent-Merchant-Id` so tenant-scoped reads pin to that merchant. The
 *  backend re-validates the grant on every request. */
export const CONSENT_STORAGE_KEY = "eirms_consent_merchant";

function readBranchOverride(): string | null {
  try {
    return localStorage.getItem(BRANCH_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readConsentOverride(): string | null {
  try {
    return localStorage.getItem(CONSENT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
  }
}

/**
 * Triggered when the access token can no longer be revived (the refresh
 * cookie is missing, revoked, or expired). The auth provider subscribes so
 * it can clear local state and redirect to /login. Decoupled this way so
 * `api()` doesn't need to know about React or react-router.
 */
type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

/** Fired once on the first HTTP 451 the SPA sees. The shell swaps in a
 *  full-page "unavailable in your region" screen; further api() calls also
 *  throw so no partial state renders. */
type RegionBlockedHandler = (body: unknown) => void;
let regionBlockedHandler: RegionBlockedHandler | null = null;

export function setRegionBlockedHandler(handler: RegionBlockedHandler | null) {
  regionBlockedHandler = handler;
}

/**
 * Single in-flight refresh promise. Multiple concurrent requests that
 * simultaneously hit a 401 should not each fire their own refresh — they
 * await the same promise and then retry their original request.
 */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      // The refresh token rides in the HttpOnly `eirms_refresh` cookie set at
      // login — `credentials: "include"` is what tells the browser to attach
      // it. The body is intentionally empty: the server reads the cookie.
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { token: string };
      localStorage.setItem(TOKEN_STORAGE_KEY, json.token);
      return json.token;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  // Auth header is rebuilt for every send (so a refreshed token swaps in
  // automatically on retry). `credentials: "include"` lets the refresh cookie
  // ride along when needed (the refresh + logout endpoints read it).
  const send = async (): Promise<Response> => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    const branchOverride = readBranchOverride();
    const consentOverride = readConsentOverride();
    return fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(branchOverride ? { "X-Branch-Id": branchOverride } : {}),
        ...(consentOverride
          ? { "X-Consent-Merchant-Id": consentOverride }
          : {}),
        ...(init.headers ?? {}),
      },
    });
  };

  let res = await send();

  // Don't try to refresh on the auth endpoints themselves — those control
  // the refresh state, and a 401 there is the real "your session is gone"
  // signal.
  const isAuthRoute =
    path.startsWith("/auth/login") ||
    path.startsWith("/auth/refresh") ||
    path.startsWith("/auth/logout");

  if (res.status === 401 && !isAuthRoute) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await send();
    } else {
      unauthorizedHandler?.();
    }
  }

  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (res.status === 451) {
    // Region-block signal fires once and short-circuits the caller — the
    // shell listens for this and swaps in a full-page block screen so users
    // don't see partial state.
    regionBlockedHandler?.(body);
    throw new ApiError("Region blocked", res.status, body);
  }
  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "message" in body
        ? String((body as Record<string, unknown>).message)
        : null) ?? res.statusText;
    throw new ApiError(message, res.status, body);
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Same auth-and-refresh dance as {@link api}, but returns the response as a
 * Blob (and its suggested filename from Content-Disposition, when present)
 * instead of parsing JSON. Use for file downloads — plain `<a href>` links
 * hit the API without the `Authorization` header and 401 on protected routes.
 */
export async function apiBlob(
  path: string,
  init: RequestInit = {},
): Promise<{ blob: Blob; filename: string | null }> {
  const send = async (): Promise<Response> => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    const branchOverride = readBranchOverride();
    const consentOverride = readConsentOverride();
    return fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(branchOverride ? { "X-Branch-Id": branchOverride } : {}),
        ...(consentOverride
          ? { "X-Consent-Merchant-Id": consentOverride }
          : {}),
        ...(init.headers ?? {}),
      },
    });
  };

  let res = await send();
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await send();
    } else {
      unauthorizedHandler?.();
    }
  }
  if (!res.ok) {
    const text = await res.text();
    const body = text ? safeJson(text) : null;
    if (res.status === 451) regionBlockedHandler?.(body);
    const message =
      (body && typeof body === "object" && "message" in body
        ? String((body as Record<string, unknown>).message)
        : null) ?? res.statusText;
    throw new ApiError(message, res.status, body);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition");
  const match = disposition?.match(/filename="?([^";]+)"?/i);
  return { blob, filename: match?.[1] ?? null };
}
