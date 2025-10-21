import type { I18nStringType, localeType } from './type';

export const parseI18nString = (str: I18nStringType | string = '', lang: localeType = 'en') => {
  if (!str || typeof str === 'string') return str;
  return str[lang] ?? str['en'];
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
): T[] => {
  if (!data) return [];

  // If it's an array, it's the old format
  if (Array.isArray(data)) {
    return data;
  }

  // If it's an object, it's the new i18n format
  if (typeof data === 'object' && data !== null) {
    return data[lang] ?? data['en'] ?? [];
  }

  return [];
};
