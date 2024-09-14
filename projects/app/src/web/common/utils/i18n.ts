import { I18nNsType } from '@fastgpt/web/types/i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

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
  return serverSideTranslations(content.locale, ['common', 'error', ...ns], null, content.locales);
};
