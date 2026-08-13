import dynamicImportBackend from './dynamicImportBackend';
import type { UserConfig } from 'next-i18next';

export const clientI18nConfig: UserConfig = {
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh-CN', 'zh-Hant'],
    localeDetection: false
  },
  defaultNS: 'common',
  fallbackLng: 'en',
  localePath: null,
  partialBundledLanguages: true,
  ns: [],
  react: {
    useSuspense: false
  },
  use: [dynamicImportBackend]
};
