import z from 'zod';

export const I18nStringSchema = z.object({
  en: z.string(),
  'zh-CN': z.string(),
  'zh-Hant': z.string().optional(),
  'ko-KR': z.string().optional()
});
export type I18nStringType = z.infer<typeof I18nStringSchema>;

export enum LangEnum {
  'zh_CN' = 'zh-CN',
  'zh_Hant' = 'zh-Hant',
  'en' = 'en',
  'ko_KR' = 'ko-KR'
}

export type localeType = `${LangEnum}`;
export const LocaleList = ['en', 'zh-CN', 'zh-Hant', 'ko-KR'] as const;
const localeSet: ReadonlySet<string> = new Set(LocaleList);

/** 将任意语言标识归一化为当前支持的 locale；缺失或无法识别时回退为英文。 */
export const resolveSupportedLocale = (value?: string): localeType =>
  value && localeSet.has(value) ? (value as localeType) : LangEnum.en;

// 保留必填与字符串类型校验，仅将当前版本不识别的非空语言标识回退为英文。
export const LanguageSchema = z
  .preprocess(
    (value) =>
      typeof value === 'string' && value.length > 0 && !localeSet.has(value) ? 'en' : value,
    z.enum(LocaleList)
  )
  .meta({ description: '用户语言偏好' });

// 持久化语言标识：工作流节点/工具往返保存时保留原始非空语言标签，选取译文时再按支持列表回退。
export const StoredLocaleSchema = z.string().trim().min(1).meta({ description: '持久化语言标识' });

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
  },
  [LangEnum.ko_KR]: {
    label: '한국어 (대한민국)',
    avatar: 'common/language/SouthKorea'
  }
};

export const I18nUnionStringSchema = z.union([I18nStringSchema, z.string()]);
export type I18nUnionStringType = z.infer<typeof I18nUnionStringSchema>;
