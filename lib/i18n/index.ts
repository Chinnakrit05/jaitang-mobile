import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en from '../../messages/en.json';
import th from '../../messages/th.json';
import ja from '../../messages/ja.json';
import zh from '../../messages/zh.json';

export const LOCALES = ['th', 'en', 'ja', 'zh'] as const;
export type Locale = (typeof LOCALES)[number];

const deviceLang = Localization.getLocales()[0]?.languageCode ?? 'en';
const initial: Locale = (LOCALES as readonly string[]).includes(deviceLang)
  ? (deviceLang as Locale)
  : 'th';

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
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  // The catalogs use `.` separators in keys (e.g. `theme.modeTitle`).
  // Tell i18next that's a path separator, not a key character.
  keySeparator: '.',
});

export default i18n;
