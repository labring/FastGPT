import type { NextApiRequest, NextApiResponse } from 'next';
import { FASTGPT_WEB_REQUEST_HEADER } from '../../global/common/system/constants';

type RequestHeaders = Headers | Record<string, string | string[] | undefined>;
type WebRequest = {
  headers: RequestHeaders;
};

type CsrfCheckOptions = {
  req: NextApiRequest;
  res: NextApiResponse;
};

const getHeader = (headers: RequestHeaders, name: string) => {
  if ('get' in headers && typeof headers.get === 'function') {
    return headers.get(name) ?? undefined;
  }

  const recordHeaders = headers as Record<string, string | string[] | undefined>;
  const value = recordHeaders[name] ?? recordHeaders[name.toLowerCase()];
  return Array.isArray(value) ? value.join(',') : value;
};

/** 解析跨域白名单；未配置时返回 undefined，以保留默认允许所有跨域的兼容行为。 */
export const parseAllowedOrigins = (value?: string) => {
  if (!value?.trim()) return undefined;

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const hasCookie = (cookie: string | undefined, name: string) =>
  cookie?.split(';').some((item) => item.trim().startsWith(`${name}=`)) ?? false;

/** 判断登录 Cookie 请求是否需要 Web 请求标记。 */
export const shouldValidateWebRequest = (req: WebRequest) =>
  hasCookie(getHeader(req.headers, 'cookie'), 'fastgpt_token');

/** 校验登录 Cookie 请求是否带有由 FastGPT Web 客户端添加的标记。 */
export const isValidWebRequest = (req: WebRequest) => {
  if (!shouldValidateWebRequest(req)) return true;
  const value = getHeader(req.headers, FASTGPT_WEB_REQUEST_HEADER);
  return typeof value === 'string' && value.trim().length > 0;
};

/**
 * 在 API handler 执行前校验登录 Cookie 请求的 Web 标记。
 * CSRF 配置由 NextAPI 决定；该函数只负责校验失败时写入 403 响应。
 */
export async function checkCsrf({ req, res }: CsrfCheckOptions) {
  if (res.writableEnded || res.writableFinished) return;

  if (isValidWebRequest({ headers: req.headers })) {
    return;
  }

  res.status(403).json({
    code: 403,
    statusText: 'csrf_invalid',
    message: 'Missing fastgpt-web-request header',
    data: null
  });
}
