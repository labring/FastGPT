import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Cookies from 'js-cookie';

export const LANG_KEY = 'NEXT_LOCALE_LANG';
export enum LangEnum {
  'zh' = 'zh',
  'en' = 'en'
}

export const setLangStore = (value: `${LangEnum}`) => {
  return Cookies.set(LANG_KEY, value, { expires: 7, sameSite: 'None', secure: true });
};

export const getLangStore = () => {
  return Cookies.get(LANG_KEY) || LangEnum.zh;
};

export const removeLangStore = () => {
  Cookies.remove(LANG_KEY);
};

export const serviceSideProps = (content: any) => {
  return serverSideTranslations(
    content.req.cookies[LANG_KEY] || 'en',
    undefined,
    null,
    content.locales
  );
};
