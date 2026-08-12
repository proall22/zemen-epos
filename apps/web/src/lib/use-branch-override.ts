import { useCallback, useEffect, useState } from "react";

import { BRANCH_STORAGE_KEY } from "./api";

const STORAGE_EVENT = "eirms:branch-changed";

function read(): string | null {
  try {
    return localStorage.getItem(BRANCH_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Read/write the branch-id stored alongside the auth token. Components that
 *  display branch-specific data should call `useBranchOverride()` so they
 *  re-render when another tab or component changes the selection. */
export function useBranchOverride(): [
  string | null,
  (next: string | null) => void,
] {
  const [value, setValue] = useState<string | null>(() => read());

  useEffect(() => {
    function onChange() {
      setValue(read());
    }
    window.addEventListener(STORAGE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(STORAGE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const update = useCallback((next: string | null) => {
    try {
      if (next === null) localStorage.removeItem(BRANCH_STORAGE_KEY);
      else localStorage.setItem(BRANCH_STORAGE_KEY, next);
    } catch {
      /* localStorage unavailable; silently keep working in-memory only */
    }
    setValue(next);
    window.dispatchEvent(new Event(STORAGE_EVENT));
  }, []);

  return [value, update];
}
