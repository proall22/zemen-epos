import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { BASE_STRINGS, SUPPORTED_LANGUAGES } from "@eirms/i18n-strings";
import { API_BASE } from "@/lib/api";

/**
 * i18next boot. The base bundle is imported statically from the shared
 * workspace package so first paint doesn't wait on a network call. DB
 * overrides fetched from `GET /i18n/bundle/:lang` (Phase 5) are merged
 * in as an `addResourceBundle` call after the initial paint.
 *
 * Detection order: localStorage → navigator.language, superseded by
 * `useAuth().setLanguage` once the user is signed in.
 */
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: [...SUPPORTED_LANGUAGES],
    ns: ["translation"],
    defaultNS: "translation",
    resources: {
      en: { translation: BASE_STRINGS.en },
      am: { translation: BASE_STRINGS.am },
    },
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "eirms_language",
    },
  });

/**
 * Pull the merged base + DB overrides for `language` and merge on top of the
 * static bundle already in memory. Called once per language: initially for
 * the boot language, again whenever the switcher flips.
 *
 * Non-fatal on failure — the static base bundle keeps working, cashiers
 * just don't see the latest SUPER_ADMIN override until the next reload.
 */
export async function loadOverrides(language: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/i18n/bundle/${language}`, {
      credentials: "include",
    });
    if (!res.ok) return;
    const merged = (await res.json()) as Record<string, unknown>;
    i18n.addResourceBundle(language, "translation", merged, true, true);
  } catch {
    // Ignore — offline / API down. The base bundle is still authoritative.
  }
}

// Preload overrides for whichever language i18next picked on boot. Fire
// and forget — the UI already rendered from the static base.
if (typeof window !== "undefined") {
  void loadOverrides(i18n.language);
  i18n.on("languageChanged", (lng) => {
    void loadOverrides(lng);
  });
}

export default i18n;
