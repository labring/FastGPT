import Cookies, { CookieAttributes } from 'js-cookie';
import { useTranslation } from 'next-i18next';

const setCookie = (key: string, value: string, options?: CookieAttributes) => {
  Cookies.set(key, value, options);
};
const getCookie = (key: string) => {
  return Cookies.get(key);
};

const LANG_KEY = 'NEXT_LOCALE';

export const useI18nLng = () => {
  const { i18n } = useTranslation();
  const languageMap: Record<string, string> = {
    zh: 'zh',
    'zh-CN': 'zh',
    'zh-Hans': 'zh',
    en: 'en',
    'en-US': 'en'
  };

  const onChangeLng = (lng: string) => {
    const lang = languageMap[lng] || 'en';

    setCookie(LANG_KEY, lang, {
      expires: 30
    });
    i18n?.changeLanguage(lang);
  };

  const setUserDefaultLng = () => {
    if (!navigator || !localStorage) return;
    if (getCookie(LANG_KEY)) return onChangeLng(getCookie(LANG_KEY) as string);

    const lang = languageMap[navigator.language] || 'en';

    // currentLng not in userLang
    return onChangeLng(lang);
  };

  return {
    onChangeLng,
    setUserDefaultLng
  };
};
