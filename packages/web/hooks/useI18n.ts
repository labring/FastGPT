import {
  getLangFromStorage,
  getLangMapping,
  LANG_KEY,
  setLangToStorage,
  SHARE_LANG_KEY
} from '../i18n/utils';
import { useTranslation } from 'next-i18next';

type ChangeLngOptions = {
  reloadOnMissing?: boolean;
};

export const useI18nLng = () => {
  const { i18n } = useTranslation();

  /**
   * 切换并持久化当前语言。
   * `reloadOnMissing` 只给用户主动切换入口使用，初始化语言时不刷新页面，避免首屏抖动。
   */
  const onChangeLng = async (lng: string, storageKey = LANG_KEY, options?: ChangeLngOptions) => {
    const lang = getLangMapping(lng);
    const prevLang = getLangFromStorage(storageKey);

    setLangToStorage(lang, storageKey);

    await i18n?.changeLanguage?.(lang);

    if (
      options?.reloadOnMissing &&
      !i18n?.hasResourceBundle?.(lang, 'common') &&
      prevLang !== lang
    ) {
      window?.location?.reload?.();
    }
  };

  const setUserDefaultLng = (forceGetDefaultLng: boolean = false) => {
    if (!navigator || !localStorage) return;

    const currentLang = getLangFromStorage();
    if (currentLang && !forceGetDefaultLng) return onChangeLng(currentLang);

    // currentLng not in userLang
    return onChangeLng(navigator.language);
  };

  const setShareDefaultLng = () => {
    if (!navigator || !localStorage) return;

    // 分享页使用独立 key：首次按浏览器语言初始化，后续只读取访问者自己的分享页偏好。
    const currentLang = getLangFromStorage(SHARE_LANG_KEY);
    return onChangeLng(currentLang || navigator.language, SHARE_LANG_KEY);
  };

  return {
    onChangeLng,
    setUserDefaultLng,
    setShareDefaultLng
  };
};
