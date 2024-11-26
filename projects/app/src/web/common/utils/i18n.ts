import { I18nNsType } from '@fastgpt/web/types/i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export enum LangEnum {
  'zh_CN' = 'zh-CN',
  'zh_TW' = 'zh-TW',
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
  [LangEnum.zh_TW]: {
    label: '中文(台湾)',
    avatar: 'common/language/China'
  }
};

export const serviceSideProps = (content: any, ns: I18nNsType = []) => {
  return serverSideTranslations(content.locale, ['common', 'error', ...ns], null, content.locales);
};
