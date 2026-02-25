import z from 'zod';

export const I18nStringSchema = z.object({
  en: z.string(),
  'zh-CN': z.string().optional(),
  'zh-Hant': z.string().optional()
});
export type I18nStringType = z.infer<typeof I18nStringSchema>;

export enum LangEnum {
  'zh_CN' = 'zh-CN',
  'zh_Hant' = 'zh-Hant',
  'en' = 'en'
}

export type localeType = `${LangEnum}`;
export const LocaleList = ['en', 'zh-CN', 'zh-Hant'] as const;

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
