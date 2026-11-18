import { LangEnum } from '@fastgpt/global/common/i18n/type';
import { parseLocale } from '@fastgpt/global/common/i18n/utils';
import { enUS } from 'date-fns/locale/en-US';
import { ko } from 'date-fns/locale/ko';
import { zhCN } from 'date-fns/locale/zh-CN';
import { zhTW } from 'date-fns/locale/zh-TW';

/** 将界面语言映射到日期格式化使用的 locale。 */
export const getDatePickerLocale = (language?: string) => {
  const locales = {
    [LangEnum.en]: enUS,
    [LangEnum.ko_KR]: ko,
    [LangEnum.zh_CN]: zhCN,
    [LangEnum.zh_Hant]: zhTW
  };
  return locales[parseLocale(language) ?? LangEnum.zh_CN];
};
