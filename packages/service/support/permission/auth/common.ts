import type { ReqHeaderAuthType } from '../type';
import { type AuthModeType } from '../type';
import { SERVICE_LOCAL_HOST } from '../../../common/system/tools';
import { type ApiRequestProps } from '../../../type/next';
import type { NextApiResponse } from 'next';
import Cookie from 'cookie';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { authUserSession } from '../../../support/user/session';
import { authOpenApiKey } from '../../../support/openapi/auth';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { serviceEnv } from '../../../env';

export const authCert = async (props: AuthModeType) => {
  const result = await parseHeaderCert(props);

  return {
    ...result,
    isOwner: true,
    canWrite: true
  };
};

/* auth the request from local service */
export const authRequestFromLocal = ({ req }: { req: ApiRequestProps }) => {
  if (req.headers.host !== SERVICE_LOCAL_HOST) {
    return Promise.reject('Invalid request');
  }
};

export async function parseHeaderCert({
  req,
  authToken = false,
  authRoot = false,
  authApiKey = false,
  authAppApiKey = false
}: AuthModeType) {
  // parse jwt
  async function authCookieToken(cookie?: string, token?: string) {
    // 获取 cookie
    const cookies = Cookie.parse(cookie || '');
    const cookieToken = token || cookies[TokenName];

    if (!cookieToken) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }

    return { ...(await authUserSession(cookieToken)), sessionId: cookieToken };
  }
  // from authorization get apikey
  async function parseAuthorization(authorization?: string) {
    if (!authorization) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }

    // Authorization 后面的 token 整体就是 APIKey，不再解析历史的 key-appId 形式。
    const apikey = authorization.split(' ')[1];
    if (!apikey) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }

    // auth apikey
    const {
      teamId,
      tmbId,
      appId: apiKeyAppId = '',
      authProxy,
      sourceName
    } = await authOpenApiKey({
      apikey,
      authApiKey,
      authAppApiKey
    });

    return {
      uid: '',
      teamId,
      tmbId,
      apikey,
      appId: apiKeyAppId,
      apiKeyAppId,
      apiKeyAuthProxy: authProxy,
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
    apiKeyAppId,
    apiKeyAuthProxy
  } = await (async () => {
    if ((authApiKey || authAppApiKey) && authorization) {
      // apikey from authorization
      const authResponse = await parseAuthorization(authorization);
      return {
        uid: authResponse.uid,
        teamId: authResponse.teamId,
        tmbId: authResponse.tmbId,
        appId: authResponse.appId,
        apiKeyAppId: authResponse.apiKeyAppId,
        openApiKey: authResponse.apikey,
        authType: AuthUserTypeEnum.apikey,
        apiKeyAuthProxy: authResponse.apiKeyAuthProxy,
        sourceName: authResponse.sourceName
      };
    }
    if (authToken && (token || cookie)) {
      // user token(from fastgpt web)
      const res = await authCookieToken(cookie, token);

      return {
        uid: res.userId,
        teamId: res.teamId,
        tmbId: res.tmbId,
        appId: '',
        openApiKey: '',
        authType: AuthUserTypeEnum.token,
        isRoot: res.isRoot,
        sessionId: res.sessionId
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

    return Promise.reject(ERROR_ENUM.unAuthorization);
  })();

  if (!authRoot && (!teamId || !tmbId)) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  return {
    userId: String(uid),
    teamId: String(teamId),
    tmbId: String(tmbId),
    appId,
    authType,
    sourceName,
    apiKeyAppId,
    apiKeyAuthProxy,
    apikey: openApiKey,
    isRoot: !!isRoot,
    sessionId
  };
}

/* set cookie */
export const TokenName = 'fastgpt_token';
export const setCookie = (res: NextApiResponse, token: string) => {
  res.setHeader(
    'Set-Cookie',
    `${TokenName}=${token}; Path=/; HttpOnly; Max-Age=604800; Samesite=Strict;`
  );
};

/* clear cookie */
export const clearCookie = (res: NextApiResponse) => {
  res.setHeader('Set-Cookie', `${TokenName}=; Path=/; Max-Age=0`);
};
