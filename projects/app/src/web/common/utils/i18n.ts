import { I18nNsType } from '@fastgpt/web/types/i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export enum LangEnum {
  'zh_CN' = 'zh-CN',
  'zh_Hant' = 'zh-Hant',
  'en' = 'en'
}
export const langMap = {
  [LangEnum.en]: {
    label: 'English(US)',
    avatar: 'common/language/America'
  },
  [LangEnum.zh_CN]: {
    label: '简体中文',
    avatar: 'common/language/China'
  },
  [LangEnum.zh_Hant]: {
    label: '繁体中文',
    avatar: 'common/language/China'
  }
};

export const serviceSideProps = (content: any, ns: I18nNsType = []) => {
  const lang = content.req?.cookies?.NEXT_LOCALE || content.locale;
  return serverSideTranslations(lang, ['common', ...ns], null);
};
