// docs/REMEDIATION.md §9.4 — i18next + expo-localization. English plus
// 13 Indian languages ship with complete translations (every key in
// en.json). `fallbackLng: 'en'` covers any key added later that a
// language file hasn't caught up with yet.
import i18next, { use as registerPlugin, changeLanguage } from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { safeStorage } from '@/services/storage';
import { logger } from '@/lib/logger';
import en from '@/locales/en.json';
import hi from '@/locales/hi.json';
import bn from '@/locales/bn.json';
import te from '@/locales/te.json';
import mr from '@/locales/mr.json';
import ta from '@/locales/ta.json';
import ur from '@/locales/ur.json';
import gu from '@/locales/gu.json';
import kn from '@/locales/kn.json';
import or from '@/locales/or.json';
import ml from '@/locales/ml.json';
import pa from '@/locales/pa.json';
import as from '@/locales/as.json';
import mai from '@/locales/mai.json';

export const SUPPORTED_LANGUAGES = [
  'en', 'hi', 'bn', 'te', 'mr', 'ta', 'ur', 'gu', 'kn', 'or', 'ml', 'pa', 'as', 'mai',
] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Display metadata for the language picker: English label + native name. */
export const LANGUAGES: readonly { code: SupportedLanguage; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'ur', label: 'Urdu', native: 'اردو' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'or', label: 'Odia', native: 'ଓଡ଼ିଆ' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം' },
  { code: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'as', label: 'Assamese', native: 'অসমীয়া' },
  { code: 'mai', label: 'Maithili', native: 'मैथिली' },
];

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
        bn: { translation: bn },
        te: { translation: te },
        mr: { translation: mr },
        ta: { translation: ta },
        ur: { translation: ur },
        gu: { translation: gu },
        kn: { translation: kn },
        or: { translation: or },
        ml: { translation: ml },
        pa: { translation: pa },
        as: { translation: as },
        mai: { translation: mai },
      },
      lng: detectDeviceLanguage(),
      fallbackLng: 'en',
      // i18next's plural suffixes (`_one`/`_other`) resolve against each
      // language's CLDR plural rules via Intl.PluralRules. Every locale
      // file also carries the bare base key (a copy of `_other`), so a
      // runtime without CLDR data for a language (e.g. Maithili) still
      // renders a translated string instead of falling back to English.
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
