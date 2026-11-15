import type { NodeApiRequest, NodeHttpResponse } from '../../../../types/http';
import { SessionErrEnum } from '@fastgpt/global/common/error/code/session';
import { SESSION_CONTEXT_HEADER } from '@fastgpt/global/support/user/session/constants';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import {
  RefreshSessionBodySchema,
  RefreshSessionResponseSchema,
  SessionStatusResponseSchema
} from '@fastgpt/global/openapi/support/user/account/session/api';
import { parseApiInput } from '../../../../common/zod/requestParseError';
import { checkIPRateLimit } from '../../../../common/rateLimit/interface/ip';
import { getClientIpFromRequest } from '../../../../common/security/clientIp';
import {
  authCert,
  setCookie,
  clearSupersededSessionCookies
} from '../../../permission/auth/common';
import { assertSessionRequestOrigin } from '../../session/http';
import { logoutUserSessions, readSessionCredentials, refreshUserSession } from './service';

/** App 与 Pro 共用刷新边界，独立校验 RT 和浏览器来源，不先验证已过期的 Access。 */
export const refreshSessionHandler = async (req: NodeApiRequest, res: NodeHttpResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    throw new Error(SessionErrEnum.methodNotAllowed);
  }
  res.setHeader('Cache-Control', 'no-store');
  assertSessionRequestOrigin(req);
  const body = parseApiInput({ req, bodySchema: RefreshSessionBodySchema }).body;
  const { refreshToken, accessToken, native } = await readSessionCredentials(
    req,
    body.refreshToken
  );
  if (!refreshToken) throw new Error(SessionErrEnum.refreshInvalid);
  if (
    !(await checkIPRateLimit({
      id: 'session-refresh',
      ip: getClientIpFromRequest(req) ?? 'unknown',
      limit: 120,
      seconds: 60
    }))
  )
    throw new Error(ERROR_ENUM.tooManyRequest);
  const result = await refreshUserSession({
    refreshToken,
    accessToken,
    expectedContext: req.headers[SESSION_CONTEXT_HEADER]
  });
  if (result.credentials) setCookie(res, { ...result.credentials, request: req });
  else clearSupersededSessionCookies(res, { request: req, session: result.session ?? undefined });
  res.setHeader('x-fastgpt-session', JSON.stringify(result.session));
  return RefreshSessionResponseSchema.parse({
    status: result.status,
    session: result.session,
    ...(native && result.credentials
      ? { token: result.credentials.token, refreshToken: result.credentials.refreshToken }
      : {})
  });
};

/** 页面重载后恢复预刷新元数据；旧登录返回 null，不获得长期 Refresh。 */
export const sessionStatusHandler = async (req: NodeApiRequest, res: NodeHttpResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    throw new Error(SessionErrEnum.methodNotAllowed);
  }
  res.setHeader('Cache-Control', 'no-store');
  assertSessionRequestOrigin(req);
  const { session } = await authCert({ req, authToken: true, allowAccountCancellation: true });
  clearSupersededSessionCookies(res, { request: req, session });
  return SessionStatusResponseSchema.parse({ session: session ?? null });
};

/** Refresh-only 退出和原生客户端退出共用同一撤销语义。 */
export const logoutSessionHandler = async (req: NodeApiRequest, res: NodeHttpResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    throw new Error(SessionErrEnum.methodNotAllowed);
  }
  assertSessionRequestOrigin(req);
  const { refreshToken } = parseApiInput({ req, bodySchema: RefreshSessionBodySchema }).body;
  await logoutUserSessions({ req, res, bodyRefreshToken: refreshToken });
};
