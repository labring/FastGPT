import { LangEnum } from '@fastgpt/global/common/i18n/type';
import Cookies from 'js-cookie';

export const LANG_KEY = 'NEXT_LOCALE';
export const SHARE_LANG_KEY = 'FASTGPT_SHARE_LOCALE';

const isInIframe = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

export const setLangToStorage = (value: string, key = LANG_KEY) => {
  const inIframe = isInIframe();
  const isShareLang = key === SHARE_LANG_KEY;
  // iframe 内平台语言不写 Cookie，避免污染宿主；分享页语言需要 SSR 读取，所以仍写专用 Cookie。
  const shouldWriteCookie = !inIframe || isShareLang;
  const cookieOptions =
    inIframe && isShareLang && location.protocol === 'https:'
      ? { expires: 30, sameSite: 'none' as const, secure: true }
      : { expires: 30 };

  if (shouldWriteCookie) {
    Cookies.set(key, value, cookieOptions);
  }

  localStorage.setItem(key, value);
};

export const getLangFromStorage = (key = LANG_KEY) => {
  return localStorage.getItem(key) || Cookies.get(key);
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

export { i18nT } from '@fastgpt/global/common/i18n/utils';
