import type { I18nStringType, localeType } from './type';
import { LangEnum } from './type';

const LANG_KEY = 'NEXT_LOCALE';

/**
 * Server-safe getLang: returns the user's language preference without
 * depending on React or any browser-only library (js-cookie, next-i18next).
 * On the server it always returns zh_CN.
 */
export const getLang = (): string => {
  if (typeof window === 'undefined') {
    return LangEnum.zh_CN;
  }
  try {
    const fromStorage = localStorage.getItem(LANG_KEY);
    if (fromStorage) return fromStorage;
    // Read from cookie without js-cookie
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${LANG_KEY}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : LangEnum.zh_CN;
  } catch {
    return LangEnum.zh_CN;
  }
};

export const parseI18nString = (str: I18nStringType | string = '', lang = 'en') => {
  if (!str || typeof str === 'string') return str;

  // 尝试使用当前语言
  if (lang in str) {
    return str[lang as keyof I18nStringType] || '';
  }

  // 如果当前语言是繁体中文但没有对应翻译，优先回退到简体中文
  if (lang === 'zh-Hant' && !str['zh-Hant'] && str['zh-CN']) {
    return str['zh-CN'];
  }

  // 最后回退到英文
  return str['en'] || '';
};

export const formatI18nLocationToZhEn = (locale: localeType = 'zh-CN'): 'zh' | 'en' => {
  if (locale.toLocaleLowerCase().startsWith('zh')) {
    return 'zh';
  }
  return 'en';
};

/**
 * Parse i18n array data, supporting both old array format and new i18n object format
 * @param data - The data to parse (array or i18n object)
 * @param lang - The target language
 * @returns The parsed array data
 */
export const parseI18nArray = <T = any>(
  data: T[] | Record<string, T[]> | undefined,
  lang: localeType = 'en'
): T[] | undefined => {
  if (!data) return [];

  // If it's an array, it's the old format
  if (Array.isArray(data)) {
    return data;
  }

  // If it's an object, it's the new i18n format
  if (typeof data === 'object' && data !== null) {
    return data[lang] ?? data['en'] ?? [];
  }

  return undefined;
};

/**
 * Isomorphic i18n key identity function for both server and client.
 * Returns the key as-is; full type checking is handled by the client-side i18nT.
 */
export const i18nT = <T extends string>(key: T): T => key;
