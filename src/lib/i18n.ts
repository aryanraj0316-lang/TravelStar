// docs/REMEDIATION.md §9.4 — i18next + expo-localization. Before this the
// `selectedLanguage` profile field was purely decorative: it persisted to
// the server and the "Select Language" sheet let a user pick Hindi,
// Punjabi, Bengali, or Tamil, but nothing ever read it back to change a
// single rendered string. Only English and Hindi have real translations
// shipped (`SUPPORTED_LANGUAGES` below) — picking one of the other three
// in the sheet falls back to English with an honest toast rather than
// silently pretending to support it (same "don't fake it" rule as
// everywhere else in this codebase).
import i18next, { use as registerPlugin, changeLanguage } from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { safeStorage } from '@/services/storage';
import { logger } from '@/lib/logger';
import en from '@/locales/en.json';
import hi from '@/locales/hi.json';

export const SUPPORTED_LANGUAGES = ['en', 'hi'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const LANGUAGE_STORAGE_KEY = 'appLanguage';

function isSupported(code: string | null | undefined): code is SupportedLanguage {
  return !!code && (SUPPORTED_LANGUAGES as readonly string[]).includes(code);
}

function detectDeviceLanguage(): SupportedLanguage {
  try {
    const locales = Localization.getLocales();
    const code = locales[0]?.languageCode;
    return isSupported(code) ? code : 'en';
  } catch (e) {
    logger.warn('[i18n] Failed to read device locale, defaulting to English:', e);
    return 'en';
  }
}

let initialized = false;

/**
 * Initializes i18next synchronously (resources are bundled, not fetched,
 * so there's nothing to await for the initial render) using the
 * device-detected language. Call once, at module load — see
 * `_layout.tsx`'s import of this module. Safe to call more than once.
 *
 * A stored language override (the user picked one in the app before) is
 * applied right after, as a fire-and-forget async follow-up — reading it
 * needs `safeStorage`, which is itself async. This means a returning user
 * whose saved language differs from their device locale sees one brief
 * render in the device language before it switches; gating first render
 * on that instead (a splash-screen dependency) was judged not worth it
 * for a switch this fast and this rare.
 */
export function initI18n(): void {
  if (initialized) return;
  initialized = true;

  void registerPlugin(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        hi: { translation: hi },
      },
      lng: detectDeviceLanguage(),
      fallbackLng: 'en',
      // i18next's own plural-key suffixes (`_one`/`_other`, etc.) already
      // resolve against each language's real CLDR plural-category count
      // (English: one/other; Hindi: one/other) — this is the same plural
      // category system ICU MessageFormat uses, without the extra
      // @formatjs dependency ICU's full syntax would need for two
      // languages whose plural rules are this simple.
      interpolation: { escapeValue: false },
      returnNull: false,
    })
    .catch((e) => logger.warn('[i18n] Failed to initialize:', e));

  safeStorage
    .getItem(LANGUAGE_STORAGE_KEY)
    .then((stored) => {
      if (isSupported(stored) && stored !== i18next.language) {
        void changeLanguage(stored);
      }
    })
    .catch((e) => logger.warn('[i18n] Failed to read stored language preference:', e));
}

/** Switches the active language and persists the choice. */
export async function setAppLanguage(lang: SupportedLanguage): Promise<void> {
  await changeLanguage(lang);
  try {
    await safeStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch (e) {
    logger.warn('[i18n] Failed to persist language preference:', e);
  }
}

export function getAppLanguage(): SupportedLanguage {
  return isSupported(i18next.language) ? i18next.language : 'en';
}

export default i18next;
