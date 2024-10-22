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

  const onChangeLng = (lng: string) => {
    setCookie(LANG_KEY, lng, {
      expires: 30,
      sameSite: 'None',
      secure: true
    });
    i18n?.changeLanguage(lng);
  };

  const setUserDefaultLng = () => {
    if (!navigator || !localStorage) return;
    if (getCookie(LANG_KEY)) return onChangeLng(getCookie(LANG_KEY) as string);

    const languageMap: Record<string, string> = {
      zh: 'zh',
      'zh-CN': 'zh'
    };

    const lang = languageMap[navigator.language] || 'en';

    // currentLng not in userLang
    return onChangeLng(lang);
  };

  return {
    onChangeLng,
    setUserDefaultLng
  };
};
