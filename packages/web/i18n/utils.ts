import { LangEnum, type localeType } from '@fastgpt/global/common/i18n/type';
import { parseLocale } from '@fastgpt/global/common/i18n/utils';
import {
  FASTGPT_LANGUAGE_HEADER,
  FASTGPT_SHARE_LANGUAGE_HEADER
} from '@fastgpt/global/common/system/constants';
import Cookies from 'js-cookie';

export const LANG_KEY = 'NEXT_LOCALE';
export const SHARE_LANG_KEY = 'FASTGPT_SHARE_LOCALE';
// 浏览器对持久 Cookie 的有效期通常限制为最多约 400 天；语言确认成功时会再次写入以滑动续期。
const PERSISTENT_LANG_COOKIE_EXPIRES_DAYS = 400;
const LANGUAGE_COOKIE_PATH = '/';

export type LanguageStorageKind = 'cookie' | 'localStorage' | 'memory';

type LanguageStorageSnapshot = {
  kind: LanguageStorageKind;
  value?: localeType;
};

const memoryLanguage = new Map<string, localeType>();

const isInIframe = () => {
  if (typeof window === 'undefined') return false;

  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

const isCookieAllowedForKey = (key: string) => {
  // 普通页面在 iframe 内不会写平台语言 Cookie；分享页使用独立 Cookie。
  return !isInIframe() || key === SHARE_LANG_KEY;
};

/**
 * 通过真实的写入和读回检测 Cookie，而不是仅依赖 navigator.cookieEnabled。
 * 这能覆盖隐私模式、第三方 Cookie 限制和沙盒 iframe 等场景。
 */
export const canUseLanguageCookie = (key = LANG_KEY) => {
  if (typeof document === 'undefined' || !isCookieAllowedForKey(key)) return false;

  const probeKey = `__fastgpt_cookie_probe_${Math.random().toString(36).slice(2)}`;
  try {
    Cookies.set(probeKey, '1', { path: '/' });
    const success = Cookies.get(probeKey) === '1';
    Cookies.remove(probeKey, { path: '/' });
    return success;
  } catch {
    try {
      Cookies.remove(probeKey, { path: '/' });
    } catch {
      // Ignore cleanup failures. The capability check itself already failed.
    }
    return false;
  }
};

/** 检测 localStorage 是否可以实际写入和读回。 */
export const canUseLanguageLocalStorage = (key = LANG_KEY) => {
  if (typeof localStorage === 'undefined') return false;

  const probeKey = `__fastgpt_local_storage_probe_${key}_${Math.random().toString(36).slice(2)}`;
  try {
    localStorage.setItem(probeKey, '1');
    const success = localStorage.getItem(probeKey) === '1';
    localStorage.removeItem(probeKey);
    return success;
  } catch {
    try {
      localStorage.removeItem(probeKey);
    } catch {
      // Ignore cleanup failures. The capability check itself already failed.
    }
    return false;
  }
};

/** 选择当前页面可用的语言偏好权威存储。 */
export const getLanguageStorageKind = (key = LANG_KEY): LanguageStorageKind => {
  if (canUseLanguageCookie(key)) return 'cookie';
  if (canUseLanguageLocalStorage(key)) return 'localStorage';
  return 'memory';
};

const readLanguageStorage = (key: string, kind: LanguageStorageKind) => {
  if (kind === 'cookie') return getLangFromCookie(key);
  if (kind === 'localStorage') return getLangFromLocalStorage(key);
  return memoryLanguage.get(key);
};

/** 读取指定权威存储中的语言值，用于事务快照和提交后校验。 */
export const readLanguagePreference = (key = LANG_KEY, kind = getLanguageStorageKind(key)) =>
  readLanguageStorage(key, kind);

/**
 * 写入语言偏好并立即读回校验。Cookie 作为权威存储时，localStorage 只做尽力镜像，
 * 镜像失败不会破坏已经成功提交的 Cookie。
 */
export const persistLanguagePreference = (
  value: string,
  key = LANG_KEY,
  kind = getLanguageStorageKind(key)
) => {
  const lang = getLangMapping(value);

  if (kind === 'cookie') {
    Cookies.set(key, lang, {
      expires: PERSISTENT_LANG_COOKIE_EXPIRES_DAYS,
      path: LANGUAGE_COOKIE_PATH,
      ...(isInIframe() && key === SHARE_LANG_KEY && window.location.protocol === 'https:'
        ? { sameSite: 'none' as const, secure: true }
        : {})
    });
    if (readLanguageStorage(key, kind) !== lang) {
      throw new Error(`Failed to persist language preference in Cookie: ${key}`);
    }

    try {
      localStorage.setItem(key, lang);
    } catch {
      // Cookie is authoritative; localStorage is only a client-side mirror.
    }
    memoryLanguage.set(key, lang);
    return;
  }

  if (kind === 'localStorage') {
    localStorage.setItem(key, lang);
    if (readLanguageStorage(key, kind) !== lang) {
      throw new Error(`Failed to persist language preference in localStorage: ${key}`);
    }
    memoryLanguage.set(key, lang);
    return;
  }

  memoryLanguage.set(key, lang);
};

/**
 * 读取不会随请求自动发送的客户端语言偏好。
 * 按指定 key 读取 Cookie、localStorage 和内存值；可选 fallbackKey 用于分享页继承主站语言。
 */
export const getClientLanguagePreference = (
  key = LANG_KEY,
  fallbackKey?: string
): localeType | undefined => {
  return (
    getPersistedLang(key) ||
    memoryLanguage.get(key) ||
    (fallbackKey && (getPersistedLang(fallbackKey) || memoryLanguage.get(fallbackKey))) ||
    (typeof navigator !== 'undefined' && navigator.language
      ? getLangMapping(navigator.language)
      : undefined)
  );
};

/**
 * 生成当前页面 API 请求使用的语言头。
 * 分享页优先使用独立语言偏好，并在没有独立偏好时继承主站偏好。
 */
export const getLanguageRequestHeaders = (pathname?: string): Record<string, string> => {
  const currentPathname =
    pathname ?? (typeof window !== 'undefined' ? window.location.pathname : undefined);
  const isSharePage =
    currentPathname === '/chat/share' || currentPathname?.endsWith('/chat/share') === true;
  const language = isSharePage
    ? getClientLanguagePreference(SHARE_LANG_KEY, LANG_KEY)
    : getClientLanguagePreference(LANG_KEY);

  return language
    ? { [isSharePage ? FASTGPT_SHARE_LANGUAGE_HEADER : FASTGPT_LANGUAGE_HEADER]: language }
    : {};
};

/** 恢复语言偏好事务快照。 */
export const restoreLanguagePreference = (snapshot: LanguageStorageSnapshot, key = LANG_KEY) => {
  if (snapshot.kind === 'cookie') {
    if (snapshot.value === undefined) {
      Cookies.remove(key, { path: '/' });
      memoryLanguage.delete(key);
    } else persistLanguagePreference(snapshot.value, key, snapshot.kind);
    return;
  }

  if (snapshot.kind === 'localStorage') {
    if (snapshot.value === undefined) {
      localStorage.removeItem(key);
      memoryLanguage.delete(key);
    } else {
      localStorage.setItem(key, snapshot.value);
      memoryLanguage.set(key, snapshot.value);
    }
    return;
  }

  if (snapshot.value === undefined) memoryLanguage.delete(key);
  else memoryLanguage.set(key, snapshot.value);
};

/** 捕获指定语言偏好的旧值，供原子切换失败时回滚。 */
export const snapshotLanguagePreference = (
  key = LANG_KEY,
  kind = getLanguageStorageKind(key)
): LanguageStorageSnapshot => {
  return { kind, value: readLanguageStorage(key, kind) };
};

/**
 * 持久化语言偏好。
 * 普通页面写统一语言 Cookie；分享页使用专用 Cookie，避免覆盖平台登录态语言。
 */
export const setLangToStorage = (value: string, key = LANG_KEY) => {
  persistLanguagePreference(value, key);
};

/**
 * 读取服务端和客户端共享的语言 Cookie。
 */
export const getLangFromCookie = (key = LANG_KEY) => {
  try {
    const lang = Cookies.get(key);
    return lang ? getLangMapping(lang) : undefined;
  } catch {
    return undefined;
  }
};

/**
 * 读取旧版或 iframe 场景下的本地语言偏好。
 */
export const getLangFromLocalStorage = (key = LANG_KEY) => {
  if (typeof localStorage === 'undefined') return undefined;

  try {
    const lang = localStorage.getItem(key);
    return lang ? getLangMapping(lang) : undefined;
  } catch {
    return undefined;
  }
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
  return parseLocale(lng) ?? LangEnum.en;
};

/** 返回资源加载必须满足的语言链；非简体中文语言同时依赖简体中文 fallback。 */
export const getRequiredI18nLanguages = (language: localeType): localeType[] =>
  language === LangEnum.zh_CN ? [LangEnum.zh_CN] : [language, LangEnum.zh_CN];

export { i18nT } from '@fastgpt/global/common/i18n/utils';
