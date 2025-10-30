import type { I18nStringType, localeType } from './type';

export const parseI18nString = (str: I18nStringType | string = '', lang = 'en') => {
  if (!str || typeof str === 'string') return str;

  // 尝试使用当前语言
  if (str[lang as localeType]) {
    return str[lang as localeType];
  }

  // 如果当前语言是繁体中文但没有对应翻译，优先回退到简体中文
  if (lang === 'zh-Hant' && str['zh-CN']) {
    return str['zh-CN'];
  }

  // 对于其他语言，也优先尝试简体中文
  if (str['zh-CN']) {
    return str['zh-CN'];
  }

  // 最后回退到英文
  return str['en'] || '';
};
