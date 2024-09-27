import { I18nNsType } from '@fastgpt/web/types/i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export enum LangEnum {
  'zh' = 'zh',
  'en' = 'en'
}
export const langMap = {
  [LangEnum.en]: {
    label: 'English(US)',
    icon: 'common/language/en',
    avatar: 'common/language/America'
  },
  [LangEnum.zh]: {
    label: '简体中文',
    icon: 'common/language/zh',
    avatar: 'common/language/China'
  }
};

export const serviceSideProps = (content: any, ns: I18nNsType = []) => {
  return serverSideTranslations(content.locale, ['common', 'error', ...ns], null, content.locales);
};
