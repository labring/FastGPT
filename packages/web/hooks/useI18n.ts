import {
  getClientLanguagePreference,
  getLangMapping,
  getPersistedLang,
  LANG_KEY,
  SHARE_LANG_KEY
} from '../i18n/utils';
import { useTranslation } from 'next-i18next';
import { changeLanguageAtomically } from '../i18n/atomicLanguageChange';
import { useCallback } from 'react';

type ChangeLngOptions = {
  reloadOnChange?: boolean;
  storageKey?: string;
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
  const onChangeLng = useCallback(
    async (lng: string, options?: ChangeLngOptions) => {
      const lang = getLangMapping(lng);
      const storageKey = options?.storageKey || LANG_KEY;
      const prevLang = getPersistedLang(storageKey);
      const currentLang = getLangMapping(i18n?.language || prevLang || lang);

      if (!i18n?.changeLanguage) return;

      await changeLanguageAtomically({
        i18n,
        language: lang,
        storageKey
      });

      if (options?.reloadOnChange && (prevLang !== lang || currentLang !== lang)) {
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }
    },
    [i18n]
  );

  const setUserDefaultLng = useCallback(() => {
    if (typeof navigator === 'undefined') return;

    const preferredLanguage = getLangMapping(
      getClientLanguagePreference(LANG_KEY) || navigator.language
    );

    // 路由切换时 next-i18next 可能先按 Router 默认值重置语言；不能仅因 Cookie 存在就跳过恢复。
    if (getLangMapping(i18n?.language || '') === preferredLanguage) return;

    return onChangeLng(preferredLanguage);
  }, [i18n?.language, onChangeLng]);

  /**
   * 分享页使用独立语言 Cookie；首次没有分享页偏好时，继承 NEXT_LOCALE 作为初始值。
   */
  const setShareDefaultLng = useCallback(() => {
    if (typeof navigator === 'undefined') return;

    const preferredLanguage = getLangMapping(
      getClientLanguagePreference(SHARE_LANG_KEY, LANG_KEY) || navigator.language
    );
    if (getLangMapping(i18n?.language || '') === preferredLanguage) return;

    return onChangeLng(preferredLanguage, {
      storageKey: SHARE_LANG_KEY
    });
  }, [i18n?.language, onChangeLng]);

  return {
    onChangeLng,
    setUserDefaultLng,
    setShareDefaultLng
  };
};
