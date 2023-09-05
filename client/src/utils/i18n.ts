import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Cookies from 'js-cookie';

export const LANG_KEY = 'NEXT_LOCALE_LANG';
export enum LangEnum {
  'zh' = 'zh',
  'en' = 'en'
}
export const langMap = {
  [LangEnum.en]: {
    label: 'English',
    icon: 'language_en'
  },
  [LangEnum.zh]: {
    label: '简体中文',
    icon: 'language_zh'
  }
};

export const setLangStore = (value: `${LangEnum}`) => {
  return Cookies.set(LANG_KEY, value, { expires: 7, sameSite: 'None', secure: true });
};

export const getLangStore = () => {
  return (Cookies.get(LANG_KEY) as `${LangEnum}`) || LangEnum.zh;
};

export const serviceSideProps = (content: any) => {
  const acceptLanguage = (content.req.headers['accept-language'] as string) || '';
  const acceptLanguageList = acceptLanguage.split(/,|;/g);
  // @ts-ignore
  const firstLang = acceptLanguageList.find((lang) => langMap[lang]);

  const language = content.req.cookies[LANG_KEY] || firstLang || 'zh';

  return serverSideTranslations(language, undefined, null, content.locales);
};
