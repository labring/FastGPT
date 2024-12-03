import Cookies, { CookieAttributes } from 'js-cookie';
import { useTranslation } from 'next-i18next';
import { LangEnum } from '../../../projects/app/src/web/common/utils/i18n';

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
    zh: LangEnum.zh_CN,
    'zh-CN': LangEnum.zh_CN,
    'zh-Hans': LangEnum.zh_CN,
    'zh-HK': LangEnum.zh_Hant,
    'zh-TW': LangEnum.zh_Hant,
    'zh-Hant': LangEnum.zh_Hant,
    en: LangEnum.en,
    'en-US': LangEnum.en
  };

  const onChangeLng = async (lng: string) => {
    const lang = languageMap[lng] || 'en';

    setCookie(LANG_KEY, lang, {
      expires: 30
    });

    const currentLng = i18n?.language;
    await i18n?.changeLanguage?.(lang);

    if (currentLng !== lang) {
      window?.location?.reload?.();
    }
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
