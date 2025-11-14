import type { I18nConfig } from 'fumadocs-core/i18n';

export const i18n: I18nConfig = {
  defaultLanguage: 'zh-CN',
  languages: ['zh-CN', 'en'],
  hideLocale: 'default-locale'
};

export async function getTranslations(locale: string) {
  const translations = await import(`@/i18n/${locale}/common.json`);
  return translations.default;
}

export function t(key: string, locale?: string) {
  const keys = key.split(':');
  const namespace = keys[0];
  const path = keys[1].split('.');

  try {
    const translations = require(`@/i18n/${locale || i18n.defaultLanguage}/common.json`);
    let result = translations;

    for (const p of path) {
      result = result[p];
    }

    return result || key;
  } catch (error) {
    return key;
  }
}
