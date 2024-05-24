import { I18nNsType } from '@/types/i18n';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export const LANG_KEY = 'NEXT_LOCALE_LANG';
export enum LangEnum {
  'zh' = 'zh',
  'en' = 'en'
}
export const langMap = {
  [LangEnum.en]: {
    label: 'English',
    icon: 'common/language/en'
  },
  [LangEnum.zh]: {
    label: '简体中文',
    icon: 'common/language/zh'
  }
};

export const serviceSideProps = (content: any, ns: I18nNsType = []) => {
  return serverSideTranslations(content.locale, ['common', ...ns], null, content.locales);
};

export const getLng = (lng: string) => {
  return lng.split('-')[0];
};
export const change2DefaultLng = (currentLng: string) => {
  if (!navigator || !localStorage) return;
  if (localStorage.getItem(LANG_KEY)) return;
  const userLang = navigator.language;

  if (userLang.includes(currentLng)) {
    return;
  }

  // currentLng not in userLang
  return getLng(userLang);
};

export const setLngStore = (lng: string) => {
  if (!localStorage) return;
  localStorage.setItem(LANG_KEY, lng);
};
