import type { I18nConfig } from 'fumadocs-core/i18n';
import {
  getPublishedDocsLocales,
  isPreviewDocsSite,
  stripDocsLocalePrefix
} from './fastgpt-home-url';

export const i18n: I18nConfig = {
  defaultLanguage: 'zh-CN',
  languages: ['zh-CN', 'en'],
  hideLocale: isPreviewDocsSite() ? 'never' : 'always'
};

export const defaultHomePath = '/guide/getting-started';

/** Return the documentation locales enabled for static search and route indexing in this build. */
export function getSearchableLanguages(): string[] {
  return getPublishedDocsLocales();
}

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
 * Get localized URL path based on i18n configuration
 * @param path - The base path (e.g., '/guide')
 * @param lang - The language code
 * @returns Localized path with language prefix if needed
 */
export function getLocalizedPath(path: string, lang: string): string {
  const { pathname, path: cleanPath } = stripDocsLocalePrefix(path);
  const suffix = cleanPath.slice(pathname.length);
  const prefixed = pathname === '/' ? `/${lang}${suffix}` : `/${lang}${pathname}${suffix}`;

  if (i18n.hideLocale === 'never') {
    return prefixed;
  }

  if (i18n.hideLocale === 'always') {
    return cleanPath;
  }

  if (i18n.hideLocale === 'default-locale') {
    return lang === i18n.defaultLanguage ? cleanPath : prefixed;
  }

  return cleanPath;
}
