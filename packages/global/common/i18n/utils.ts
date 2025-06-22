import type { I18nStringType, localeType } from './type';

export const parseI18nString = (str: I18nStringType | string = '', lang: localeType = 'en') => {
  if (typeof str === 'string') return str;
  return str[lang] ?? str['en'];
};
