import { LocaleList, LangEnum, type localeType } from '@fastgpt/global/common/i18n/type';
import {
  FASTGPT_LANGUAGE_HEADER,
  FASTGPT_SHARE_LANGUAGE_HEADER
} from '@fastgpt/global/common/system/constants';
import Cookie from 'cookie';
import type { NodeHttpRequest } from '../../types/http';

const parseLocale = (value?: string): localeType | undefined => {
  if (!value) return undefined;

  const normalized = value.trim().toLowerCase().replaceAll('_', '-');
  if (normalized === LangEnum.en.toLowerCase() || normalized.startsWith('en-')) {
    return LangEnum.en;
  }
  if (normalized === LangEnum.ko_KR.toLowerCase()) {
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
  return LocaleList.includes(value.trim() as localeType) ? (value.trim() as localeType) : undefined;
};

const getHeaderValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/**
 * 按分享页语言请求头 →（分享请求的）分享语言 Cookie → 主站语言 Cookie → 客户端语言请求头 → 英文兜底的顺序获取请求语言。
 * 客户端封装会发送对应页面的语言请求头，以便服务端使用 localStorage、memory 或
 * navigator.language 推导出的语言；分享页请求头独立于主站语言链路。
 */
export const getLocale = (req: NodeHttpRequest): localeType => {
  const cookies = Cookie.parse(req.headers.cookie ?? '');
  const locale = parseLocale(cookies.NEXT_LOCALE);
  const shareHeaderValue = getHeaderValue(req.headers[FASTGPT_SHARE_LANGUAGE_HEADER]);
  const shareHeaderLocale = parseLocale(shareHeaderValue);
  // 分享 Cookie 的 Path 是 `/`，普通页面也可能携带它；只有带分享请求头时才启用该 Cookie。
  const shareCookieLocale =
    shareHeaderValue !== undefined ? parseLocale(cookies.FASTGPT_SHARE_LOCALE) : undefined;
  const customLocale = parseLocale(getHeaderValue(req.headers[FASTGPT_LANGUAGE_HEADER]));

  return shareHeaderLocale ?? shareCookieLocale ?? locale ?? customLocale ?? LangEnum.en;
};
