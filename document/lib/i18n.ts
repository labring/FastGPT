import type { I18nConfig } from 'fumadocs-core/i18n';

export const i18n: I18nConfig = {
  defaultLanguage: 'zh-CN',
  languages: ['zh-CN', 'en'],
  hideLocale: 'never'
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

/**
 * Get localized URL path based on i18n configuration
 * @param path - The base path (e.g., '/docs/introduction')
 * @param lang - The language code
 * @returns Localized path with language prefix if needed
 */
export function getLocalizedPath(path: string, lang: string): string {
  // If hideLocale is 'never', always add language prefix
  if (i18n.hideLocale === 'never') {
    return `/${lang}${path}`;
  }

  // If hideLocale is 'always', never add language prefix
  if (i18n.hideLocale === 'always') {
    return path;
  }

  // If hideLocale is 'default-locale', only add prefix for non-default languages
  if (i18n.hideLocale === 'default-locale') {
    return lang === i18n.defaultLanguage ? path : `/${lang}${path}`;
  }

  // Fallback: no prefix
  return path;
}

/**
 * Server-side redirect with automatic language prefix
 * Import from next/navigation and use this wrapper
 */
export { redirect } from 'next/navigation';
