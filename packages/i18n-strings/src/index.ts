import en from './strings/en.json';
import am from './strings/am.json';

/**
 * The base translation bundle. Consumers merge DB overrides on top at
 * runtime; this file is the source of truth for what a key means and for
 * the set of keys that exist.
 *
 * Both `apps/web` (via react-i18next) and `apps/api` (via a tiny sync
 * lookup for email + SMS) import from this package so there is exactly one
 * copy of the strings on disk and no room for drift.
 */
export const BASE_STRINGS = {
  en,
  am,
} as const;

export type LanguageCode = keyof typeof BASE_STRINGS;

export const SUPPORTED_LANGUAGES: readonly LanguageCode[] = ['en', 'am'];

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

/**
 * Nested-key lookup on the base bundle. Returns the raw template — the
 * caller is responsible for interpolation. Missing keys resolve to the
 * English fallback, then the raw key path.
 *
 * Kept intentionally simple: no plural rules, no ICU. If we grow into
 * either, we swap this out for `i18next` on the API side too.
 */
export function lookupBase(language: LanguageCode, key: string): string {
  const primary = walk(BASE_STRINGS[language] as Record<string, unknown>, key);
  if (primary !== undefined) return primary;
  const fallback = walk(BASE_STRINGS.en as Record<string, unknown>, key);
  return fallback ?? key;
}

function walk(bundle: Record<string, unknown>, key: string): string | undefined {
  const parts = key.split('.');
  let cursor: unknown = bundle;
  for (const part of parts) {
    if (cursor && typeof cursor === 'object' && part in cursor) {
      cursor = (cursor as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof cursor === 'string' ? cursor : undefined;
}

/**
 * Flatten the nested base bundle to a Map of dotted-key → value. Used by
 * the SUPER_ADMIN translation-management surface to enumerate every string
 * the SPA can look up.
 */
export function flattenBundle(
  bundle: Record<string, unknown>,
  prefix = '',
  out = new Map<string, string>(),
): Map<string, string> {
  for (const [k, v] of Object.entries(bundle)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      out.set(path, v);
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      flattenBundle(v as Record<string, unknown>, path, out);
    }
  }
  return out;
}

/**
 * Turn a Map of dotted keys back into the nested shape react-i18next / the
 * SPA i18n runtime consume. Inverse of {@link flattenBundle}.
 */
export function nestBundle(flat: Map<string, string>): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [key, value] of flat) {
    const parts = key.split('.');
    let cursor = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const next = cursor[part];
      if (!next || typeof next !== 'object' || Array.isArray(next)) {
        cursor[part] = {};
      }
      cursor = cursor[part] as Record<string, unknown>;
    }
    cursor[parts[parts.length - 1]] = value;
  }
  return root;
}
