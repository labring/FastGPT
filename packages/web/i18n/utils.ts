import { type I18nKeyFunction } from './i18next';
import { LangEnum } from '@fastgpt/global/common/i18n/type';
import Cookies from 'js-cookie';

const LANG_KEY = 'NEXT_LOCALE';

const isInIframe = () => {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
};

export const setLangToStorage = (value: string) => {
  if (isInIframe()) {
    localStorage.setItem(LANG_KEY, value);
  } else {
    // 不在 iframe 中，同时使用 Cookie 和 localStorage
    Cookies.set(LANG_KEY, value, { expires: 30 });
    localStorage.setItem(LANG_KEY, value);
  }
};

export const getLangFromStorage = () => {
  return localStorage.getItem(LANG_KEY) || Cookies.get(LANG_KEY);
};

export const getLangMapping = (lng: string): string => {
  const languageMap: Record<string, string> = {
    zh: LangEnum.zh_CN,
    'zh-CN': LangEnum.zh_CN,
    'zh-Hans': LangEnum.zh_CN,
    'zh-HK': LangEnum.zh_Hant,
    'zh-TW': LangEnum.zh_Hant,
    'zh-Hant': LangEnum.zh_Hant,
    en: LangEnum.en,
    'en-US': LangEnum.en
  };

  let lang = languageMap[lng];

  // 如果没有直接映射，尝试智能回退
  if (!lang) {
    const langPrefix = lng.split('-')[0];
    // 中文相关语言优先回退到简体中文
    if (langPrefix === 'zh') {
      lang = LangEnum.zh_CN;
    }
    if (langPrefix === 'en') {
      lang = LangEnum.en;
    }
  }

  return lang || LangEnum.zh_CN;
};

export const i18nT: I18nKeyFunction = (key) => key;
