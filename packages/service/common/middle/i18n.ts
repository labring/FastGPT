import { LangEnum, type localeType } from '@fastgpt/global/common/i18n/type';
import { parseLocale } from '@fastgpt/global/common/i18n/utils';
import {
  FASTGPT_LANGUAGE_HEADER,
  FASTGPT_SHARE_LANGUAGE_HEADER
} from '@fastgpt/global/common/system/constants';
import Cookie from 'cookie';
import type { NodeHttpRequest } from '../../types/http';

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
