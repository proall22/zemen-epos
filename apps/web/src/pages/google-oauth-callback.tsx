import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { savePendingAuth } from "@/lib/pending-auth";
import type { PendingAuthResponse } from "@/lib/types";

export const GOOGLE_ENROLLMENT_KEY = "zemen_google_enrollment";

export function GoogleOAuthCallbackPage() {
  const navigate = useNavigate();
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const encoded = params.get("result");
      if (!encoded) throw new Error("cancelled");
      const result = JSON.parse(decodeBase64Url(encoded)) as
        | { mode: "login"; pending: PendingAuthResponse }
        | { mode: "signup"; enrollmentToken: string };
      history.replaceState(null, "", window.location.pathname);
      if (result.mode === "login") {
        savePendingAuth(result.pending);
        navigate("/auth", { replace: true });
      } else {
        sessionStorage.setItem(GOOGLE_ENROLLMENT_KEY, result.enrollmentToken);
        navigate("/signup", { replace: true });
      }
    } catch {
      navigate("/login?google=failed", { replace: true });
    }
  }, [navigate]);
  return (
    <main className="flex min-h-svh items-center justify-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="size-5 animate-spin" /> Completing Google sign-in…
    </main>
  );
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return decodeURIComponent(
    Array.from(
      atob(padded),
      (character) =>
        `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`,
    ).join(""),
  );
}
