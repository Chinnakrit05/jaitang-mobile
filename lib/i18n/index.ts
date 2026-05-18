import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from '../../messages/en.json';
import th from '../../messages/th.json';
import ja from '../../messages/ja.json';
import zh from '../../messages/zh.json';

export const LOCALES = ['th', 'en', 'ja', 'zh'] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  th: 'ไทย',
  en: 'English',
  ja: '日本語',
  zh: '中文',
};

const STORAGE_KEY = 'jt-locale';

const deviceLang = Localization.getLocales()[0]?.languageCode ?? 'en';
const deviceInitial: Locale = (LOCALES as readonly string[]).includes(deviceLang)
  ? (deviceLang as Locale)
  : 'th';

export function toSupportedLocale(value: string | undefined | null): Locale {
  const base = value?.split('-')[0];
  return base && (LOCALES as readonly string[]).includes(base)
    ? (base as Locale)
    : 'th';
}

export function currentLocale(): Locale {
  return toSupportedLocale(i18n.resolvedLanguage ?? i18n.language);
}

// Same JSON catalogs the web app ships. Curly-brace placeholders in
// next-intl (e.g. `{count}`) match i18next's default interpolation, so
// no transformation is needed.
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    th: { translation: th },
    ja: { translation: ja },
    zh: { translation: zh },
  },
  lng: deviceInitial,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
    prefix: '{',
    suffix: '}',
  },
  // The catalogs use `.` separators in keys (e.g. `theme.modeTitle`).
  // Tell i18next that's a path separator, not a key character.
  keySeparator: '.',
});

// Rehydrate stored choice after init. Brief flash of device-language strings
// before this resolves is acceptable; the alternative would be blocking app
// boot on AsyncStorage which is worse.
AsyncStorage.getItem(STORAGE_KEY)
  .then((stored) => {
    if (stored && (LOCALES as readonly string[]).includes(stored) && stored !== i18n.language) {
      void i18n.changeLanguage(stored);
    }
  })
  .catch(() => {});

export async function setLocale(next: Locale): Promise<void> {
  await i18n.changeLanguage(next);
  AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
}

export default i18n;
