import { LocaleList, LangEnum, type localeType } from '@fastgpt/global/common/i18n/type';
import { FASTGPT_LANGUAGE_HEADER } from '@fastgpt/global/common/system/constants';
import Cookie from 'cookie';
import type { NodeHttpRequest } from '../../types/http';

const parseLocale = (value?: string): localeType | undefined => {
  if (!value) return undefined;

  const normalized = value.trim().toLowerCase();
  if (normalized === LangEnum.en.toLowerCase() || normalized.startsWith('en-')) {
    return LangEnum.en;
  }
  if (normalized === LangEnum.zh_Hant.toLowerCase() || ['zh-tw', 'zh-hk'].includes(normalized)) {
    return LangEnum.zh_Hant;
  }
  if (
    normalized === LangEnum.zh_CN.toLowerCase() ||
    normalized === 'zh' ||
    normalized.startsWith('zh-')
  ) {
    return LangEnum.zh_CN;
  }
  return LocaleList.includes(value.trim() as localeType) ? (value.trim() as localeType) : undefined;
};

const getHeaderValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/**
 * 按 Cookie → 客户端语言请求头 → 英文兜底的顺序获取请求语言。
 * 客户端封装会在 Cookie 不可用时额外发送 FASTGPT_LANGUAGE_HEADER，以便服务端使用
 * localStorage、memory 或 navigator.language 推导出的语言。
 */
export const getLocale = (req: NodeHttpRequest): localeType => {
  const locale = Cookie.parse(req.headers.cookie ?? '').NEXT_LOCALE;
  const customLocale = parseLocale(getHeaderValue(req.headers[FASTGPT_LANGUAGE_HEADER]));

  return parseLocale(locale) ?? customLocale ?? LangEnum.en;
};
