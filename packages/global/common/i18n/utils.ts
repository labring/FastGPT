import type { I18nStringType, localeType } from './type';

export const parseI18nString = (str: I18nStringType | string = '', lang = 'en') => {
  if (!str || typeof str === 'string') return str;
  return str[lang as localeType] ?? str['en'];
};
