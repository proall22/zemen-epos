import type { PendingAuthResponse } from "./types";

const KEY = "zemen_pending_auth";

export function savePendingAuth(value: PendingAuthResponse): void {
  sessionStorage.setItem(KEY, JSON.stringify(value));
}

export function readPendingAuth(): PendingAuthResponse | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(KEY) ?? "null",
    ) as PendingAuthResponse | null;
    return value?.pendingToken ? value : null;
  } catch {
    return null;
  }
}

export function clearPendingAuth(): void {
  sessionStorage.removeItem(KEY);
}
