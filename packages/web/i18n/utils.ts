import { LangEnum, type localeType } from '@fastgpt/global/common/i18n/type';
import Cookies from 'js-cookie';

export const LANG_KEY = 'NEXT_LOCALE';
export const SHARE_LANG_KEY = 'FASTGPT_SHARE_LOCALE';
const PERSISTENT_LANG_COOKIE_EXPIRES_DAYS = 36500;

const languageMap: Record<string, localeType> = {
  zh: LangEnum.zh_CN,
  'zh-CN': LangEnum.zh_CN,
  'zh-Hans': LangEnum.zh_CN,
  'zh-HK': LangEnum.zh_Hant,
  'zh-TW': LangEnum.zh_Hant,
  'zh-Hant': LangEnum.zh_Hant,
  en: LangEnum.en,
  'en-US': LangEnum.en
};

const isInIframe = () => {
  if (typeof window === 'undefined') return false;

  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

/**
 * 持久化语言偏好。
 * 普通页面写统一语言 Cookie；分享页使用专用 Cookie，避免覆盖平台登录态语言。
 */
export const setLangToStorage = (value: string, key = LANG_KEY) => {
  const lang = getLangMapping(value);
  const inIframe = isInIframe();
  const isShareLang = key === SHARE_LANG_KEY;

  if (!inIframe || isShareLang) {
    // 语言偏好按长期设置处理；iframe 内仅允许分享页专用 Cookie，避免污染平台登录态语言。
    Cookies.set(key, lang, {
      expires: PERSISTENT_LANG_COOKIE_EXPIRES_DAYS,
      ...(inIframe && isShareLang && window.location.protocol === 'https:'
        ? { sameSite: 'none' as const, secure: true }
        : {})
    });
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(key, lang);
  }
};

/**
 * 读取服务端和客户端共享的语言 Cookie。
 */
export const getLangFromCookie = (key = LANG_KEY) => {
  const lang = Cookies.get(key);
  return lang ? getLangMapping(lang) : undefined;
};

/**
 * 读取旧版或 iframe 场景下的本地语言偏好。
 */
export const getLangFromLocalStorage = (key = LANG_KEY) => {
  if (typeof localStorage === 'undefined') return undefined;

  const lang = localStorage.getItem(key);
  return lang ? getLangMapping(lang) : undefined;
};

/**
 * 获取客户端可用的持久化语言，优先使用 Cookie，localStorage 仅作为兼容兜底。
 */
export const getPersistedLang = (key = LANG_KEY) => {
  return getLangFromCookie(key) || getLangFromLocalStorage(key);
};

/**
 * 将浏览器语言或历史存储值归一化成系统支持的 locale。
 */
export const getLangMapping = (lng: string): localeType => {
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
