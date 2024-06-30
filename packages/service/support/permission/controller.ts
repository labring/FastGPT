import Cookie from 'cookie';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import jwt from 'jsonwebtoken';
import { NextApiResponse } from 'next';
import type { AuthModeType, ReqHeaderAuthType } from './type.d';
import { AuthUserTypeEnum, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { authOpenApiKey } from '../openapi/auth';
import { FileTokenQuery } from '@fastgpt/global/common/file/type';
import { MongoResourcePermission } from './schema';

export const getResourcePermission = async ({
  resourceType,
  teamId,
  tmbId,
  resourceId
}: {
  resourceType: PerResourceTypeEnum;
  teamId: string;
  tmbId: string;
  resourceId?: string;
}) => {
  const per = await MongoResourcePermission.findOne({
    tmbId,
    teamId,
    resourceType,
    resourceId
  });

  if (!per) {
    return null;
  }
  return per;
};
export const delResourcePermissionById = (id: string) => {
  return MongoResourcePermission.findByIdAndRemove(id);
};

/* 下面代码等迁移 */
/* create token */
export function createJWT(user: { _id?: string; team?: { teamId?: string; tmbId: string } }) {
  const key = process.env.TOKEN_KEY as string;
  const token = jwt.sign(
    {
      userId: String(user._id),
      teamId: String(user.team?.teamId),
      tmbId: String(user.team?.tmbId),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
    },
    key
  );
  return token;
}

// auth token
export function authJWT(token: string) {
  return new Promise<{
    userId: string;
    teamId: string;
    tmbId: string;
  }>((resolve, reject) => {
    const key = process.env.TOKEN_KEY as string;

    jwt.verify(token, key, function (err, decoded: any) {
      if (err || !decoded?.userId) {
        reject(ERROR_ENUM.unAuthorization);
        return;
      }

      resolve({
        userId: decoded.userId,
        teamId: decoded.teamId || '',
        tmbId: decoded.tmbId
      });
    });
  });
}

export async function parseHeaderCert({
  req,
  authToken = false,
  authRoot = false,
  authApiKey = false
}: AuthModeType) {
  // parse jwt
  async function authCookieToken(cookie?: string, token?: string) {
    // 获取 cookie
    const cookies = Cookie.parse(cookie || '');
    const cookieToken = token || cookies[TokenName];

    if (!cookieToken) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }

    return await authJWT(cookieToken);
  }
  // from authorization get apikey
  async function parseAuthorization(authorization?: string) {
    if (!authorization) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }

    // Bearer fastgpt-xxxx-appId
    const auth = authorization.split(' ')[1];
    if (!auth) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }

    const { apikey, appId: authorizationAppid = '' } = await (async () => {
      const arr = auth.split('-');
      // abandon
      if (arr.length === 3) {
        return {
          apikey: `${arr[0]}-${arr[1]}`,
          appId: arr[2]
        };
      }
      if (arr.length === 2) {
        return {
          apikey: auth
        };
      }
      return Promise.reject(ERROR_ENUM.unAuthorization);
    })();

    // auth apikey
    const { teamId, tmbId, appId: apiKeyAppId = '' } = await authOpenApiKey({ apikey });

    return {
      uid: '',
      teamId,
      tmbId,
      apikey,
      appId: apiKeyAppId || authorizationAppid
    };
  }
  // root user
  async function parseRootKey(rootKey?: string) {
    if (!rootKey || !process.env.ROOT_KEY || rootKey !== process.env.ROOT_KEY) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }
  }

  const { cookie, token, rootkey, authorization } = (req.headers || {}) as ReqHeaderAuthType;

  const { uid, teamId, tmbId, appId, openApiKey, authType } = await (async () => {
    if (authApiKey && authorization) {
      // apikey from authorization
      const authResponse = await parseAuthorization(authorization);
      return {
        uid: authResponse.uid,
        teamId: authResponse.teamId,
        tmbId: authResponse.tmbId,
        appId: authResponse.appId,
        openApiKey: authResponse.apikey,
        authType: AuthUserTypeEnum.apikey
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
        authType: AuthUserTypeEnum.token
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
        authType: AuthUserTypeEnum.root
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
    apikey: openApiKey
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

/* file permission */
export const createFileToken = (data: FileTokenQuery) => {
  if (!process.env.FILE_TOKEN_KEY) {
    return Promise.reject('System unset FILE_TOKEN_KEY');
  }
  const expiredTime = Math.floor(Date.now() / 1000) + 60 * 30;

  const key = process.env.FILE_TOKEN_KEY as string;
  const token = jwt.sign(
    {
      ...data,
      exp: expiredTime
    },
    key
  );
  return Promise.resolve(token);
};

export const authFileToken = (token?: string) =>
  new Promise<FileTokenQuery>((resolve, reject) => {
    if (!token) {
      return reject(ERROR_ENUM.unAuthFile);
    }
    const key = process.env.FILE_TOKEN_KEY as string;

    jwt.verify(token, key, function (err, decoded: any) {
      if (err || !decoded.bucketName || !decoded?.teamId || !decoded?.tmbId || !decoded?.fileId) {
        reject(ERROR_ENUM.unAuthFile);
        return;
      }
      resolve({
        bucketName: decoded.bucketName,
        teamId: decoded.teamId,
        tmbId: decoded.tmbId,
        fileId: decoded.fileId
      });
    });
  });
