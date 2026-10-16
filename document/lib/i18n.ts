import type { I18nConfig } from 'fumadocs-core/i18n';
import { getHostLocalePath } from './site';

// NOTE: defaultLanguage here is the *content* default (un-suffixed .mdx files are zh-CN) and
// must stay zh-CN. URL prefixing per domain is handled by lib/site.ts (getHostLocalePath).
export const i18n: I18nConfig = {
  defaultLanguage: 'zh-CN',
  languages: ['zh-CN', 'en'],
  hideLocale: 'never'
};

export const defaultHomePath = '/guide/getting-started';

export async function getTranslations(locale: string) {
  const translations = await import(`@/i18n/${locale}/common.json`);
  return translations.default;
}

export function t(key: string, locale?: string) {
  const keys = key.split(':');
  const path = keys[1].split('.');

  const readTranslation = (targetLocale: string) => {
    try {
      const translations = require(`@/i18n/${targetLocale}/common.json`);
      let result = translations;

      for (const p of path) {
        result = result[p];
      }

      return result;
    } catch (error) {
      return undefined;
    }
  };

  const targetLocale = locale || i18n.defaultLanguage;
  const result = readTranslation(targetLocale);
  if (result) {
    return result;
  }

  if (targetLocale !== 'en') {
    return readTranslation('en') || key;
  }

  return key;
}

/**
 * Get localized URL path for the current domain.
 * The domain's default locale (io: en, cn: zh-CN) is unprefixed; the other locale is prefixed.
 * @param path - The base path (e.g., '/guide')
 * @param lang - The language code
 */
export function getLocalizedPath(path: string, lang: string): string {
  return getHostLocalePath(lang, path);
}

/**
 * Server-side redirect with automatic language prefix
 * Import from next/navigation and use this wrapper
 */
export { redirect } from 'next/navigation';
