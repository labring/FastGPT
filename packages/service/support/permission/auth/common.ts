import type { ReqHeaderAuthType } from '../type';
import { type AuthModeType } from '../type';
import { SERVICE_LOCAL_HOST } from '../../../common/system/tools';
import type { NodeHttpRequest, NodeHttpResponse } from '../../../types/http';
import Cookie from 'cookie';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { authUserSession } from '../../../support/user/session';
import { authOpenApiKey } from '../../../support/openapi/auth';
import { assertCancellation } from '../../../support/user/account/cancellation/guard';
import { getUserIdByTmbId } from '../../../support/user/team/utils';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { serviceEnv } from '../../../env';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import { SessionErrEnum } from '@fastgpt/global/common/error/code/session';
import {
  SESSION_API_PATH,
  SESSION_REFRESH_COOKIE_NAME,
  SESSION_SELECTOR_COOKIE_NAME,
  SESSION_CONTEXT_HEADER
} from '@fastgpt/global/support/user/session/constants';
import type { IssuedSessionCredentials } from '@fastgpt/global/support/user/session/type';
import {
  getSessionCookieNames,
  readSelectedSessionCookies,
  assertSessionContext
} from '../../user/session/http';

export const authCert = async (props: AuthModeType) => {
  const result = await parseHeaderCert(props);

  return {
    ...result,
    isOwner: result.apiKeyType !== ApiKeyTypeEnum.app,
    canWrite: result.apiKeyType !== ApiKeyTypeEnum.app
  };
};

/* auth the request from local service */
export const authRequestFromLocal = ({ req }: { req: NodeHttpRequest }) => {
  if (req.headers.host !== SERVICE_LOCAL_HOST) {
    return Promise.reject('Invalid request');
  }
};

export async function parseHeaderCert({
  req,
  authToken = false,
  authRoot = false,
  authApiKey = false,
  authAppApiKey = false,
  allowAccountCancellation = false
}: AuthModeType) {
  // parse jwt
  async function authCookieToken(token?: string) {
    // 获取 cookie
    const cookieToken = token || (await readSelectedSessionCookies(req)).accessToken;

    if (!cookieToken) {
      throw new Error(SessionErrEnum.accessMissing);
    }

    const identity = await authUserSession(cookieToken);
    assertSessionContext(req.headers[SESSION_CONTEXT_HEADER], {
      sessionId: identity.sessionId,
      contextVersion: identity.session?.contextVersion
    });
    return identity;
  }
  // from authorization get apikey
  async function parseAuthorization(authorization?: string) {
    if (!authorization) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }

    // Authorization 支持真实 APIKey，也支持仅作传输兼容的 apiKey-appId。
    const apikey = authorization.split(' ')[1];
    if (!apikey) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }

    // auth apikey
    const {
      teamId,
      tmbId,
      apikey: realApiKey,
      legacyAppId = '',
      parsedAppId = '',
      authProxy,
      apiKeyId,
      apiKeyType,
      boundAppId,
      sourceName
    } = await authOpenApiKey({
      apikey,
      authApiKey,
      authAppApiKey
    });
    const userId = await getUserIdByTmbId(tmbId);

    return {
      uid: userId,
      teamId,
      tmbId,
      apikey: realApiKey,
      legacyAppId,
      parsedAppId,
      apiKeyAuthProxy: authProxy,
      apiKeyId,
      apiKeyType,
      boundAppId,
      sourceName
    };
  }
  // root user
  async function parseRootKey(rootKey?: string) {
    if (!rootKey || rootKey !== serviceEnv.ROOT_KEY) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }
  }

  const { cookie, token, rootkey, authorization } = (req.headers || {}) as ReqHeaderAuthType;

  const {
    uid,
    teamId,
    tmbId,
    appId,
    openApiKey,
    authType,
    isRoot,
    sourceName,
    sessionId,
    sessionCreatedAt,
    session,
    legacyAppId,
    parsedAppId,
    apiKeyAuthProxy,
    apiKeyId,
    apiKeyType,
    boundAppId
  } = await (async () => {
    if ((authApiKey || authAppApiKey) && authorization) {
      // apikey from authorization
      const authResponse = await parseAuthorization(authorization);
      return {
        uid: authResponse.uid,
        teamId: authResponse.teamId,
        tmbId: authResponse.tmbId,
        appId: '',
        legacyAppId: authResponse.legacyAppId,
        parsedAppId: authResponse.parsedAppId,
        openApiKey: authResponse.apikey,
        authType: AuthUserTypeEnum.apikey,
        apiKeyAuthProxy: authResponse.apiKeyAuthProxy,
        apiKeyId: authResponse.apiKeyId,
        apiKeyType: authResponse.apiKeyType,
        boundAppId: authResponse.boundAppId,
        sourceName: authResponse.sourceName
      };
    }
    if (authToken && (token || cookie)) {
      // user token(from fastgpt web)
      const sessionData = await authCookieToken(token);

      return {
        uid: sessionData.userId,
        teamId: sessionData.teamId,
        tmbId: sessionData.tmbId,
        appId: '',
        openApiKey: '',
        authType: AuthUserTypeEnum.token,
        isRoot: sessionData.isRoot,
        sessionId: sessionData.sessionId,
        sessionCreatedAt: sessionData.createdAt,
        session: sessionData.session
      };
    }
    if (authRoot && rootkey) {
      await parseRootKey(rootkey);
      // root user
      return {
        uid: '',
        teamId: '',
        tmbId: '',
        appId: '',
        openApiKey: '',
        authType: AuthUserTypeEnum.root,
        isRoot: true
      };
    }

    return Promise.reject(
      authToken ? new Error(SessionErrEnum.accessMissing) : ERROR_ENUM.unAuthorization
    );
  })();

  if (!authRoot && (!teamId || !tmbId)) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  // 系统 root 代管进入处于注销冷静期的租户团队时需允许正常排查与管理，不受租户注销门禁阻断。
  const shouldAssertCancellation =
    !isRoot &&
    (authType === AuthUserTypeEnum.apikey ||
      (authType === AuthUserTypeEnum.token && !allowAccountCancellation));
  if (shouldAssertCancellation) {
    await assertCancellation({
      teamId: String(teamId),
      // 应用凭证不受归属人的个人注销/ACL 支配，团队注销仍必须阻止应用访问。
      userId: apiKeyType === ApiKeyTypeEnum.app ? undefined : String(uid)
    });
  }

  return {
    userId: String(uid),
    teamId: String(teamId),
    tmbId: String(tmbId),
    appId,
    authType,
    sourceName,
    legacyAppId,
    parsedAppId,
    apiKeyAuthProxy,
    apiKeyId,
    apiKeyType,
    boundAppId,
    apikey: openApiKey,
    isRoot: !!isRoot,
    sessionId,
    sessionCreatedAt,
    session
  };
}

export const TokenName = 'fastgpt_token';

/** 统一生成登录 Cookie 属性，确保写入与清理行为一致。 */
const getAuthCookieOptions = () => ({
  path: '/',
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: serviceEnv.AUTH_COOKIE_SECURE
});

/**
 * 写入登录凭证 Cookie；启用 AUTH_COOKIE_SECURE 后，浏览器只会通过 HTTPS 发送凭证。
 */
export const setCookie = (
  res: NodeHttpResponse,
  value:
    | string
    | (IssuedSessionCredentials & { request?: NodeHttpRequest; selectSession?: boolean })
) => {
  const credentials = typeof value === 'string' ? { token: value } : value;
  const existing = res.getHeader('Set-Cookie');
  const headers =
    existing === undefined
      ? []
      : Array.isArray(existing)
        ? existing.map(String)
        : [String(existing)];
  const now = Date.now();
  const refreshPath = `${serviceEnv.NEXT_PUBLIC_BASE_URL}/api${SESSION_API_PATH}`;
  if (credentials.session && credentials.refreshToken) {
    const names = getSessionCookieNames(
      credentials.session.sessionId,
      credentials.session.contextVersion
    );
    headers.push(
      Cookie.serialize(names.access, credentials.token, {
        ...getAuthCookieOptions(),
        maxAge: Math.max(0, Math.ceil((credentials.session.accessExpiresAt - now) / 1000))
      })
    );
    headers.push(
      Cookie.serialize(names.refresh, credentials.refreshToken, {
        ...getAuthCookieOptions(),
        path: refreshPath,
        maxAge: Math.max(0, Math.ceil((credentials.session.refreshExpiresAt - now) / 1000))
      })
    );
    // 只有明确的新登录可以选择设备。普通刷新、改密和切团队均不能覆盖其他页的新登录定位。
    if (credentials.selectSession)
      headers.push(
        Cookie.serialize(SESSION_SELECTOR_COOKIE_NAME, credentials.session.sessionId, {
          ...getAuthCookieOptions(),
          maxAge: Math.max(0, Math.ceil((credentials.session.absoluteExpiresAt - now) / 1000))
        })
      );
    const cookies = Cookie.parse(credentials.request?.headers.cookie ?? '');
    // 改密 / 切团队的路径收不到 Refresh Cookie，仍须按旧上下文成对清理，避免不断累积到 Header 上限。
    const previousContexts = new Set<string>();
    if (credentials.session.contextVersion > 1)
      previousContexts.add(String(credentials.session.contextVersion - 1));
    for (const name of Object.keys(cookies)) {
      const match = /^fastgpt_(?:access|refresh)_([a-f0-9]{32})_([1-9]\d*)$/.exec(name);
      if (match?.[1] === names.tag && match[2] !== String(credentials.session.contextVersion))
        previousContexts.add(match[2]);
    }
    for (const context of previousContexts) {
      for (const kind of ['access', 'refresh']) {
        headers.push(
          Cookie.serialize(`fastgpt_${kind}_${names.tag}_${context}`, '', {
            ...getAuthCookieOptions(),
            path: kind === 'refresh' ? refreshPath : '/',
            maxAge: 0
          })
        );
      }
    }
  } else {
    headers.push(
      Cookie.serialize(TokenName, credentials.token, { ...getAuthCookieOptions(), maxAge: 604800 })
    );
    if (credentials.selectSession)
      headers.push(
        Cookie.serialize(SESSION_SELECTOR_COOKIE_NAME, '', { ...getAuthCookieOptions(), maxAge: 0 })
      );
  }
  res.setHeader('Set-Cookie', headers);
  res.setHeader('x-fastgpt-session', JSON.stringify(credentials.session ?? null));
};

/**
 * 只清理认证凭据，保留无认证能力的定位 Cookie 到其自然过期或下次登录覆盖。
 * 已删除的 Redis 会话不会因迟到刷新回包复活；不删除固定定位名，避免旧退出回包清掉其他页的新登录。
 */
export const clearCookie = (res: NodeHttpResponse, req?: NodeHttpRequest) => {
  const existing = res.getHeader('Set-Cookie');
  const names = new Set([TokenName, SESSION_REFRESH_COOKIE_NAME]);
  for (const name of Object.keys(Cookie.parse(req?.headers.cookie ?? ''))) {
    if (/^fastgpt_(access|refresh)_[a-f0-9]{32}_[1-9]\d*$/.test(name)) names.add(name);
  }
  res.setHeader('Set-Cookie', [
    ...(existing === undefined
      ? []
      : Array.isArray(existing)
        ? existing.map(String)
        : [String(existing)]),
    ...Array.from(names, (name) =>
      Cookie.serialize(name, '', {
        ...getAuthCookieOptions(),
        path:
          name === SESSION_REFRESH_COOKIE_NAME || name.startsWith('fastgpt_refresh_')
            ? `${serviceEnv.NEXT_PUBLIC_BASE_URL}/api${SESSION_API_PATH}`
            : '/',
        maxAge: 0
      })
    )
  ]);
};
