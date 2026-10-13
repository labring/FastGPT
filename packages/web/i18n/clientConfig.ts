import dynamicImportBackend from './dynamicImportBackend';
import type { UserConfig } from 'next-i18next';
import { LocaleList } from '@fastgpt/global/common/i18n/type';

export const clientI18nConfig: UserConfig = {
  i18n: {
    defaultLocale: 'en',
    locales: [...LocaleList],
    localeDetection: false
  },
  supportedLngs: [...LocaleList],
  load: 'currentOnly',
  defaultNS: 'common',
  fallbackLng: 'zh-CN',
  localePath: null,
  partialBundledLanguages: true,
  ns: [],
  react: {
    useSuspense: false
  },
  use: [dynamicImportBackend]
};
