import {
  getLangFromCookie,
  getLangFromLocalStorage,
  getLangMapping,
  getPersistedLang,
  setLangToStorage
} from '../i18n/utils';
import { useTranslation } from 'next-i18next';

type ChangeLngOptions = {
  reloadOnChange?: boolean;
};

/**
 * 提供客户端语言切换能力，并负责把手动选择和首次访问初始化写入统一语言偏好。
 */
export const useI18nLng = () => {
  const { i18n } = useTranslation();

  /**
   * 切换并持久化当前语言。
   * `reloadOnChange` 只给用户主动切换入口使用，确保 SSR 数据、页面命名空间和客户端状态重新按新语言初始化。
   */
  const onChangeLng = async (lng: string, options?: ChangeLngOptions) => {
    const lang = getLangMapping(lng);
    const prevLang = getPersistedLang();
    const currentLang = getLangMapping(i18n?.language || prevLang || lang);

    setLangToStorage(lang);

    await i18n?.changeLanguage?.(lang);

    if (options?.reloadOnChange && (prevLang !== lang || currentLang !== lang)) {
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    }
  };

  const setUserDefaultLng = () => {
    if (typeof navigator === 'undefined' || typeof localStorage === 'undefined') return;
    // 有 Cookie 时以服务端渲染语言为准；没有 Cookie 时先迁移旧的本地偏好。
    if (getLangFromCookie()) return;

    return onChangeLng(getLangFromLocalStorage() || navigator.language);
  };

  return {
    onChangeLng,
    setUserDefaultLng
  };
};
