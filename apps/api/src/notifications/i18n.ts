import { Injectable } from '@nestjs/common';
import {
  BASE_STRINGS,
  DEFAULT_LANGUAGE,
  flattenBundle,
} from '@eirms/i18n-strings';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Server-side translation lookup used by the notification pipeline
 * (email templates + SMS). Kept intentionally simple — synchronous
 * `t(key, params, locale)` returning a string. Overrides authored via
 * `/admin/i18n/keys` are picked up automatically because the merged
 * bundle is read from the same `translation_overrides` table.
 *
 * Overrides are cached per-language with a short TTL so a burst of
 * outbound emails doesn't hammer the DB for the same string.
 */
@Injectable()
export class NotificationsI18nService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly OVERRIDE_TTL_MS = 60_000;
  private readonly overrideCache = new Map<
    string,
    { at: number; map: Map<string, string> }
  >();
  private readonly baseCache = new Map<string, Map<string, string>>();

  private baseFlat(language: string): Map<string, string> {
    const cached = this.baseCache.get(language);
    if (cached) return cached;
    const bundle =
      (BASE_STRINGS as Record<string, Record<string, unknown>>)[language] ??
      BASE_STRINGS[DEFAULT_LANGUAGE];
    const flat = flattenBundle(bundle);
    this.baseCache.set(language, flat);
    return flat;
  }

  private async overrideMap(language: string): Promise<Map<string, string>> {
    const now = Date.now();
    const cached = this.overrideCache.get(language);
    if (cached && now - cached.at < this.OVERRIDE_TTL_MS) return cached.map;
    const rows = await this.prisma.translationOverride.findMany({
      where: { language },
      select: { key: true, value: true },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    this.overrideCache.set(language, { at: now, map });
    return map;
  }

  /**
   * Resolve a translation key for one language. Order:
   *  1. Override for the requested language.
   *  2. Base string for the requested language.
   *  3. Base string for the default language (English).
   *  4. Literal key path (fallback of last resort).
   *
   * `params` are interpolated with `{{name}}` placeholders — the same
   * shape react-i18next uses so keys can be shared between web and api.
   */
  async t(
    key: string,
    params?: Record<string, string | number>,
    language: string = DEFAULT_LANGUAGE,
  ): Promise<string> {
    const overrides = await this.overrideMap(language);
    let raw = overrides.get(key);
    if (raw === undefined) raw = this.baseFlat(language).get(key);
    if (raw === undefined) raw = this.baseFlat(DEFAULT_LANGUAGE).get(key);
    if (raw === undefined) raw = key;
    return interpolate(raw, params);
  }

  /** Batched translator — resolves multiple keys under one language read. */
  async tMany(
    keys: Array<{
      key: string;
      params?: Record<string, string | number>;
    }>,
    language: string = DEFAULT_LANGUAGE,
  ): Promise<string[]> {
    const overrides = await this.overrideMap(language);
    const base = this.baseFlat(language);
    const fallback = this.baseFlat(DEFAULT_LANGUAGE);
    return keys.map(({ key, params }) => {
      let raw = overrides.get(key) ?? base.get(key) ?? fallback.get(key) ?? key;
      return interpolate(raw, params);
    });
  }
}

function interpolate(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const value = params[name];
    return value === undefined ? `{{${name}}}` : String(value);
  });
}
