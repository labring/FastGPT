import type { IssuedSessionCredentials } from '@fastgpt/global/support/user/session/type';
import type { NodeHttpRequest } from '../../../types/http';
import {
  FASTGPT_WEB_REQUEST_HEADER,
  FASTGPT_WEB_REQUEST_VALUE
} from '@fastgpt/global/common/system/constants';
import { SessionErrEnum } from '@fastgpt/global/common/error/code/session';
import { serviceEnv } from '../../../env';
import Cookie from 'cookie';
import { createHash } from 'node:crypto';
import {
  SESSION_SELECTOR_COOKIE_NAME,
  SESSION_REFRESH_COOKIE_NAME,
  SESSION_CONTEXT_HEADER
} from '@fastgpt/global/support/user/session/constants';
import { sessionTokenCache } from '../session';

/** 公开版本只用于收窄已认证请求，不能作为认证凭证；不匹配时业务必须尚未执行。 */
export const assertSessionContext = (
  expected: string | string[] | undefined,
  identity: { sessionId: string; contextVersion?: number }
) => {
  if (expected !== undefined && expected !== `${identity.sessionId}.${identity.contextVersion}`)
    throw new Error(SessionErrEnum.contextChanged);
};

/** Cookie 名按稳定设备和安全上下文隔离；普通轮换保持同名，旧上下文回包无法覆盖新凭证。 */
export const getSessionCookieNames = (sessionId: string, contextVersion: number) => {
  const tag = createHash('sha256').update(sessionId).digest('hex').slice(0, 32);
  return {
    access: `fastgpt_access_${tag}_${contextVersion}`,
    refresh: `fastgpt_refresh_${tag}_${contextVersion}`,
    tag
  };
};

/** 定位 Cookie 本身没有认证能力，必须读取当前上下文对应的凭证并由核心服务校验摘要。 */
export const readSelectedSessionCookies = async (req: NodeHttpRequest) => {
  const cookies = Cookie.parse(req.headers.cookie ?? '');
  const sessionId = cookies[SESSION_SELECTOR_COOKIE_NAME];
  if (!sessionId)
    return {
      cookies,
      accessToken: cookies.fastgpt_token,
      refreshToken: cookies[SESSION_REFRESH_COOKIE_NAME]
    };
  if (!/^[\w-]+:[\w-]+$/.test(sessionId)) throw new Error(SessionErrEnum.accessInvalid);
  const data = await sessionTokenCache.get(sessionId);
  if (!data) throw new Error(SessionErrEnum.revoked);
  // 重签已提交但新 Cookie 尚未安装时，旧请求属于上下文变化，不能误报凭证缺失导致退出。
  assertSessionContext(req.headers[SESSION_CONTEXT_HEADER], {
    sessionId,
    contextVersion: data.contextVersion
  });
  const names = getSessionCookieNames(sessionId, data.contextVersion);
  const access = cookies[names.access];
  const refresh = cookies[names.refresh];
  if (
    !access &&
    !refresh &&
    Object.keys(cookies).some(
      (name) =>
        name !== names.access &&
        name !== names.refresh &&
        (name.startsWith(`fastgpt_access_${names.tag}_`) ||
          name.startsWith(`fastgpt_refresh_${names.tag}_`))
    )
  )
    throw new Error(SessionErrEnum.contextChanged);
  return {
    cookies,
    accessToken: access?.startsWith(`at.${sessionId}.${data.contextVersion}.`) ? access : undefined,
    refreshToken: refresh?.startsWith(`rt.${sessionId}.${data.contextVersion}.`)
      ? refresh
      : undefined
  };
};

/** 原生客户端显式选择 Header 传输且不得带浏览器 Origin / Cookie，避免将 RT 暴露给网页响应。 */
export const isNativeSessionTransport = (req: NodeHttpRequest) =>
  req.headers['x-fastgpt-session-transport'] === 'header' &&
  !req.headers.origin &&
  !req.headers.cookie;

/** 浏览器仅获得 Access 和公开生命周期，Refresh 仅写 HttpOnly Cookie；原生客户端收到完整凭证。 */
export const getPublicSessionCredentials = (
  credentials: IssuedSessionCredentials,
  req: NodeHttpRequest
) => {
  if (isNativeSessionTransport(req)) return credentials;
  return { token: credentials.token, session: credentials.session };
};

/** Session Cookie 的 GET / POST 均要求 Web 标记并校验已提供的浏览器来源，独立于旧 GET-only CSRF。 */
export const assertSessionRequestOrigin = (req: NodeHttpRequest) => {
  if (isNativeSessionTransport(req)) return;
  if (
    req.headers[FASTGPT_WEB_REQUEST_HEADER] !== FASTGPT_WEB_REQUEST_VALUE ||
    req.headers['sec-fetch-site'] === 'cross-site'
  )
    throw new Error(SessionErrEnum.csrfInvalid);
  const source = req.headers.origin ?? req.headers.referer;
  if (!source) return;
  try {
    const sourceUrl = new URL(source);
    const configuredOrigin = new URL(serviceEnv.FE_DOMAIN).origin;
    if (sourceUrl.origin !== configuredOrigin && sourceUrl.host !== req.headers.host)
      throw new Error('Origin mismatch');
    if (!['http:', 'https:'].includes(sourceUrl.protocol))
      throw new Error('Invalid origin protocol');
  } catch {
    throw new Error(SessionErrEnum.csrfInvalid);
  }
};
