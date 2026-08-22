import { LangEnum, LocaleList, type localeType } from './type';

/**
 * 文案解析器接受的宽松结构。插件 SDK 仍可能返回缺少 zh-CN 的旧版文案，解析时统一回退英文；
 * 公共 I18nStringSchema 继续约束业务侧文案必须包含 en 和 zh-CN。
 */
type I18nStringLikeType = {
  en: string;
  'zh-CN'?: string;
  'zh-Hant'?: string;
  'ko-KR'?: string;
};

/**
 * i18n key 标记函数。
 * 只返回原 key，用于在 global/service 层声明可翻译字段并保留字面量类型；真正翻译仍由前端 i18next 处理。
 */
export const i18nT = <T extends string>(key: T): T => key;

/**
 * 将浏览器、Cookie 或请求头中的语言标签归一化为 FastGPT 支持的 locale。
 * 语言标签不区分大小写，并兼容下划线、纯语言码及同语言的地区变体。
 */
export const parseLocale = (value?: string): localeType | undefined => {
  if (!value) return;

  const normalized = value.trim().toLowerCase().replaceAll('_', '-');
  if (normalized === 'en' || normalized.startsWith('en-')) {
    return LangEnum.en;
  }
  if (normalized === 'ko' || normalized.startsWith('ko-')) {
    return LangEnum.ko_KR;
  }
  if (
    normalized === LangEnum.zh_Hant.toLowerCase() ||
    normalized.startsWith('zh-hant-') ||
    ['zh-tw', 'zh-hk'].includes(normalized)
  ) {
    return LangEnum.zh_Hant;
  }
  if (
    normalized === LangEnum.zh_CN.toLowerCase() ||
    normalized === 'zh' ||
    normalized.startsWith('zh-')
  ) {
    return LangEnum.zh_CN;
  }

  return LocaleList.find((locale) => locale.toLowerCase() === normalized);
};

export const parseI18nString = (str: I18nStringLikeType | string = '', lang = 'en') => {
  if (!str || typeof str === 'string') return str;

  // 尝试使用当前语言
  if (lang in str) {
    return str[lang as keyof I18nStringLikeType] || '';
  }

  // 如果当前语言是繁体中文但没有对应翻译，优先回退到简体中文
  if (lang === 'zh-Hant' && !str['zh-Hant'] && str['zh-CN']) {
    return str['zh-CN'];
  }

  // 最后回退到英文
  return str['en'] || '';
};

export const formatI18nLocationToZhEn = (locale: localeType = 'zh-CN'): 'zh' | 'en' => {
  if (locale.toLocaleLowerCase().startsWith('zh')) {
    return 'zh';
  }
  return 'en';
};
