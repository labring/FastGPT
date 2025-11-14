import { LangEnum } from '@fastgpt/global/common/i18n/type';
import Cookies from 'js-cookie';
import { useTranslation } from 'next-i18next';

const LANG_KEY = 'NEXT_LOCALE';
const isInIframe = () => {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
};
const setLang = (value: string) => {
  if (isInIframe()) {
    localStorage.setItem(LANG_KEY, value);
  } else {
    // 不在 iframe 中，同时使用 Cookie 和 localStorage
    Cookies.set(LANG_KEY, value, { expires: 30 });
    localStorage.setItem(LANG_KEY, value);
  }
};
export const getLang = () => {
  // 检查是否在浏览器环境中
  if (typeof window === 'undefined') {
    return LangEnum.zh_CN;
  }
  return localStorage.getItem(LANG_KEY) || Cookies.get(LANG_KEY);
};

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
    const prevLang = getLang();

    if (prevLang === lang) {
      return;
    }

    setLang(lang);

    if (lang === LangEnum.zh_CN || lang === LangEnum.zh_Hant) {
      window?.location?.reload?.();
      return;
    }

    await i18n?.changeLanguage?.(lang);

    if (!i18n?.hasResourceBundle?.(lang, 'common')) {
      window?.location?.reload?.();
    }
  };

  const setUserDefaultLng = (forceGetDefaultLng: boolean = false) => {
    if (!navigator || !localStorage) return;

    if (getLang() && !forceGetDefaultLng) return onChangeLng(getLang() as string);

    const lang = languageMap[navigator.language] || 'en';

    // currentLng not in userLang
    return onChangeLng(lang);
  };

  return {
    onChangeLng,
    setUserDefaultLng
  };
};
