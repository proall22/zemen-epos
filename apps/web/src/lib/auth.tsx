import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import i18n from "@/i18n";

import {
  ApiError,
  BRANCH_STORAGE_KEY,
  CONSENT_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  setUnauthorizedHandler,
} from "./api";
import { hasPermission } from "./permissions";
import type { ConsentScope } from "./types";
import {
  fetchMeContext,
  logoutRequest,
  loginRequest,
  signupMerchant,
  updatePreferences,
  type SignupMerchantInput,
} from "./resources";
import {
  SELLER_INFO,
  sellerInfoFromContext,
  type SellerInfo,
} from "./seller-info";
import type {
  AuthUser,
  AvailableBranch,
  MeBranch,
  Merchant,
  LoginResponse,
  PendingAuthResponse,
} from "./types";

interface AuthContextValue {
  status: "loading" | "authed" | "anonymous";
  user: AuthUser | null;
  merchant: Merchant | null;
  /** The branch the SPA is currently acting as. Reflects the switcher
   *  selection (X-Branch-Id) — swap by calling `selectBranch()`. */
  branch: MeBranch | null;
  /** Every branch the signed-in user may switch to. Empty for SUPER_ADMIN. */
  availableBranches: AvailableBranch[];
  /** SellerInfo derived from the loaded merchant + branch with env-default
   *  fallbacks. Equal to `SELLER_INFO` when no one is signed in. */
  sellerInfo: SellerInfo;
  login: (
    email: string,
    password: string,
    turnstileToken?: string,
  ) => Promise<PendingAuthResponse>;
  signup: (input: SignupMerchantInput) => Promise<PendingAuthResponse>;
  completeAuthentication: (result: LoginResponse) => Promise<void>;
  logout: () => void;
  /** Change the active branch. Persists via useBranchOverride (localStorage
   *  + X-Branch-Id) and re-fetches the me/context so activeBranch is fresh. */
  selectBranch: (branchId: string) => Promise<void>;
  language: string;
  setLanguage: (language: string) => Promise<void>;
  can: (code: string) => boolean;
  /** SUPER_ADMIN's active consent session (acting inside a merchant), or null. */
  consentSession: ConsentSession | null;
  /** Enter a merchant the super-admin holds a live grant for. Persists the
   *  session + starts sending X-Consent-Merchant-Id. */
  enterMerchant: (session: ConsentSession) => void;
  /** Leave the consent session and return to the platform view. */
  exitMerchant: () => void;
}

/** A SUPER_ADMIN's active "acting inside merchant X" session, established after
 *  a merchant admin accepts a consent request. Persisted so it survives a
 *  reload; the merchantId is separately mirrored to CONSENT_STORAGE_KEY for the
 *  api client to attach as X-Consent-Merchant-Id. */
export interface ConsentSession {
  merchantId: string;
  merchantName: string;
  scopes: ConsentScope[];
  /** ISO expiry of the grant — used for the countdown + auto-exit. */
  expiresAt: string;
}

const CONSENT_SESSION_KEY = "eirms_consent_session";

function readConsentSession(): ConsentSession | null {
  try {
    const raw = localStorage.getItem(CONSENT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentSession;
    // Drop an already-expired session on read so we never act on stale access.
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Drop the persisted branch selection. The choice belongs to whoever was
 *  signed in — carrying it into the next session sends another tenant's
 *  branch as X-Branch-Id and every call 403s. */
function clearBranchSelection() {
  try {
    localStorage.removeItem(BRANCH_STORAGE_KEY);
    window.dispatchEvent(new Event("eirms:branch-changed"));
  } catch {
    /* localStorage unavailable — nothing was persisted to begin with. */
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [branch, setBranch] = useState<MeBranch | null>(null);
  const [availableBranches, setAvailableBranches] = useState<AvailableBranch[]>(
    [],
  );
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");
  const [consentSession, setConsentSession] = useState<ConsentSession | null>(
    () => readConsentSession(),
  );

  const reconcileActiveBranch = useCallback(
    (serverActive: MeBranch | null, list: AvailableBranch[]) => {
      const storedId = (() => {
        try {
          return localStorage.getItem(BRANCH_STORAGE_KEY);
        } catch {
          return null;
        }
      })();
      const storedInList = storedId
        ? list.find((b) => b.id === storedId)
        : null;
      if (storedInList) {
        setBranch(storedInList);
        return;
      }
      if (storedId && !storedInList) {
        try {
          localStorage.removeItem(BRANCH_STORAGE_KEY);
          window.dispatchEvent(new Event("eirms:branch-changed"));
        } catch {
          /* noop */
        }
      }
      setBranch(serverActive);
      if (serverActive) {
        try {
          localStorage.setItem(BRANCH_STORAGE_KEY, serverActive.id);
          window.dispatchEvent(new Event("eirms:branch-changed"));
        } catch {
          /* noop */
        }
      }
    },
    [],
  );

  const logout = useCallback(() => {
    // Best-effort revoke of the refresh cookie on the server — never await
    // the response (so a network hiccup doesn't block the local sign-out).
    // The server reads the HttpOnly `eirms_refresh` cookie itself, so the
    // SPA passes nothing.
    void logoutRequest().catch(() => {
      /* silent — logout is idempotent */
    });
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    localStorage.removeItem(CONSENT_SESSION_KEY);
    clearBranchSelection();
    setUser(null);
    setMerchant(null);
    setBranch(null);
    setAvailableBranches([]);
    setConsentSession(null);
    setStatus("anonymous");
  }, []);

  // Wire the api client's 401 handler to our logout — the api module is React-
  // free so it can't redirect on its own.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Validate stored token on mount + hydrate the tenant context.
  useEffect(() => {
    if (!user) return;
    if (i18n.language !== user.language) {
      void i18n.changeLanguage(user.language);
    }
  }, [user?.language]);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      setStatus("anonymous");
      return;
    }
    fetchMeContext()
      .then((ctx) => {
        setUser(ctx.user);
        setMerchant(ctx.merchant);
        reconcileActiveBranch(ctx.activeBranch, ctx.availableBranches);
        setAvailableBranches(ctx.availableBranches);
        setStatus("authed");
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          // Already cleared by handler.
          return;
        }
        // Network or unexpected — treat as anonymous so the user can retry.
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setStatus("anonymous");
      });
  }, []);

  const login = useCallback(
    async (email: string, password: string, turnstileToken?: string) => {
      return loginRequest(email.trim(), password, turnstileToken);
    },
    [],
  );

  const completeAuthentication = useCallback(
    async (result: LoginResponse) => {
      localStorage.setItem(TOKEN_STORAGE_KEY, result.token);
      clearBranchSelection();
      setUser(result.user);
      setStatus("authed");
      try {
        const ctx = await fetchMeContext();
        setMerchant(ctx.merchant);
        reconcileActiveBranch(ctx.activeBranch, ctx.availableBranches);
        setAvailableBranches(ctx.availableBranches);
      } catch {
        /* Non-fatal — UI keeps working with env-default seller info. */
      }
    },
    [reconcileActiveBranch],
  );

  const signup = useCallback(async (input: SignupMerchantInput) => {
    // Same return shape as login — the backend issues a JWT so the new
    // merchant owner is signed in immediately. They land on /merchants with
    // a pending banner; invoice/receipt creation stays blocked until a
    // super-admin approves.
    return signupMerchant(input);
  }, []);

  const selectBranch = useCallback(
    async (branchId: string) => {
      // Persist first so the fetchMeContext round-trip already carries the new
      // X-Branch-Id header — the server then validates access and returns
      // activeBranch reflecting the switch.
      const previous = (() => {
        try {
          return localStorage.getItem(BRANCH_STORAGE_KEY);
        } catch {
          return null;
        }
      })();
      try {
        localStorage.setItem(BRANCH_STORAGE_KEY, branchId);
      } catch {
        /* localStorage unavailable — in-memory switch still works. */
      }
      window.dispatchEvent(new Event("eirms:branch-changed"));
      try {
        const ctx = await fetchMeContext();
        setMerchant(ctx.merchant);
        reconcileActiveBranch(ctx.activeBranch, ctx.availableBranches);
        setAvailableBranches(ctx.availableBranches);
      } catch (err) {
        try {
          if (previous) localStorage.setItem(BRANCH_STORAGE_KEY, previous);
          else localStorage.removeItem(BRANCH_STORAGE_KEY);
        } catch {
          /* noop */
        }
        window.dispatchEvent(new Event("eirms:branch-changed"));
        throw err;
      }
    },
    [reconcileActiveBranch],
  );

  const enterMerchant = useCallback((session: ConsentSession) => {
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, session.merchantId);
      localStorage.setItem(CONSENT_SESSION_KEY, JSON.stringify(session));
    } catch {
      /* localStorage unavailable — in-memory session still works this tab. */
    }
    setConsentSession(session);
  }, []);

  const exitMerchant = useCallback(() => {
    try {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
      localStorage.removeItem(CONSENT_SESSION_KEY);
    } catch {
      /* noop */
    }
    setConsentSession(null);
  }, []);

  // Auto-exit when the grant window closes so the UI never shows access the
  // server would 403. Fires a one-shot timer for the remaining time.
  useEffect(() => {
    if (!consentSession) return;
    const remaining = new Date(consentSession.expiresAt).getTime() - Date.now();
    if (remaining <= 0) {
      exitMerchant();
      return;
    }
    const timer = setTimeout(exitMerchant, remaining);
    return () => clearTimeout(timer);
  }, [consentSession, exitMerchant]);

  const can = useCallback(
    (code: string) => hasPermission(user?.role, code, consentSession?.scopes),
    [user?.role, consentSession],
  );

  const sellerInfo = useMemo<SellerInfo>(
    () => (user ? sellerInfoFromContext(merchant, branch) : SELLER_INFO),
    [user, merchant, branch],
  );

  const setLanguage = useCallback(
    async (language: string) => {
      await i18n.changeLanguage(language);
      if (!user) return;
      try {
        const updated = await updatePreferences({ language });
        setUser(updated);
      } catch {}
    },
    [user],
  );

  const language = user?.language ?? i18n.language ?? "en";

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      merchant,
      branch,
      availableBranches,
      sellerInfo,
      login,
      signup,
      completeAuthentication,
      logout,
      selectBranch,
      language,
      setLanguage,
      can,
      consentSession,
      enterMerchant,
      exitMerchant,
    }),
    [
      status,
      user,
      merchant,
      branch,
      availableBranches,
      sellerInfo,
      login,
      signup,
      completeAuthentication,
      logout,
      selectBranch,
      language,
      setLanguage,
      can,
      consentSession,
      enterMerchant,
      exitMerchant,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

/** Convenience hook for printable receipts/invoices — falls back to the
 *  env-default {@link SELLER_INFO} when used outside an authed flow (e.g.
 *  the public-invoice page wrapped in a different layout). */
export function useSellerInfo(): SellerInfo {
  const ctx = useContext(AuthContext);
  return ctx?.sellerInfo ?? SELLER_INFO;
}
