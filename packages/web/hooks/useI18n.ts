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
const getLang = () => {
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
    let lang = languageMap[lng];

    // 如果没有直接映射，尝试智能回退
    if (!lang) {
      const langPrefix = lng.split('-')[0];
      // 中文相关语言优先回退到简体中文
      if (langPrefix === 'zh') {
        lang = LangEnum.zh_CN;
      }
    }

    const prevLang = getLang();

    setLang(lang);

    await i18n?.changeLanguage?.(lang);

    if (!i18n?.hasResourceBundle?.(lang, 'common') && prevLang !== lang) {
      window?.location?.reload?.();
    }
  };

  const setUserDefaultLng = (forceGetDefaultLng: boolean = false) => {
    if (!navigator || !localStorage) return;

    if (getLang() && !forceGetDefaultLng) return onChangeLng(getLang() as string);

    // 尝试精确匹配浏览器语言
    let lang = languageMap[navigator.language];

    // 如果没有精确匹配，尝试匹配语言前缀
    if (!lang) {
      const browserLangPrefix = navigator.language.split('-')[0];
      // 中文语言环境下优先回退到简体中文
      if (browserLangPrefix === 'zh') {
        lang = LangEnum.zh_CN;
      }
    }

    // currentLng not in userLang
    return onChangeLng(lang);
  };

  return {
    onChangeLng,
    setUserDefaultLng
  };
};
