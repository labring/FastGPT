import type { NextApiRequest } from 'next';
import Cookie from 'cookie';
import { App, OpenApi, User, KB } from '../mongo';
import type { AppSchema, UserModelSchema } from '@/types/mongoSchema';
import { ERROR_ENUM } from '../errorCode';
import { authJWT } from './tools';
import { authOpenApiKey } from '../support/openapi/auth';

export enum AuthUserTypeEnum {
  token = 'token',
  root = 'root',
  apikey = 'apikey'
}

/* auth balance */
export const authBalanceByUid = async (uid: string) => {
  const user = await User.findById<UserModelSchema>(
    uid,
    '_id username balance openaiAccount timezone'
  );
  if (!user) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  if (user.balance <= 0) {
    return Promise.reject(ERROR_ENUM.insufficientQuota);
  }
  return user;
};

/* uniform auth user */
export const authUser = async ({
  req,
  authToken = false,
  authRoot = false,
  authApiKey = false,
  authBalance = false
}: {
  req: NextApiRequest;
  authToken?: boolean;
  authRoot?: boolean;
  authApiKey?: boolean;
  authBalance?: boolean;
}) => {
  const authCookieToken = async (cookie?: string, token?: string): Promise<string> => {
    // 获取 cookie
    const cookies = Cookie.parse(cookie || '');
    const cookieToken = cookies.token || token;

    if (!cookieToken) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }

    return await authJWT(cookieToken);
  };
  // from authorization get apikey
  const parseAuthorization = async (authorization?: string) => {
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
    const { userId, appId: apiKeyAppId = '' } = await authOpenApiKey({ apikey });

    return {
      uid: userId,
      apikey,
      appId: apiKeyAppId || authorizationAppid
    };
  };
  // root user
  const parseRootKey = async (rootKey?: string, userId = '') => {
    if (!rootKey || !process.env.ROOT_KEY || rootKey !== process.env.ROOT_KEY) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }
    return userId;
  };

  const { cookie, token, apikey, rootkey, userid, authorization } = (req.headers || {}) as {
    cookie?: string;
    token?: string;
    apikey?: string;
    rootkey?: string; // abandon
    userid?: string;
    authorization?: string;
  };

  let uid = '';
  let appId = '';
  let openApiKey = apikey;
  let authType: `${AuthUserTypeEnum}` = AuthUserTypeEnum.token;

  if (authToken && (cookie || token)) {
    // user token(from fastgpt web)
    uid = await authCookieToken(cookie, token);
    authType = AuthUserTypeEnum.token;
  } else if (authRoot && rootkey) {
    // root user
    uid = await parseRootKey(rootkey, userid);
    authType = AuthUserTypeEnum.root;
  } else if (authApiKey && apikey) {
    // apikey
    const parseResult = await authOpenApiKey({ apikey });
    uid = parseResult.userId;
    authType = AuthUserTypeEnum.apikey;
    openApiKey = parseResult.apikey;
  } else if (authApiKey && authorization) {
    // apikey from authorization
    const authResponse = await parseAuthorization(authorization);
    uid = authResponse.uid;
    appId = authResponse.appId;
    openApiKey = authResponse.apikey;
    authType = AuthUserTypeEnum.apikey;
  }

  // not rootUser and no uid, reject request
  if (!rootkey && !uid) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  // balance check
  const user = await (() => {
    if (authBalance) {
      return authBalanceByUid(uid);
    }
  })();

  return {
    userId: String(uid),
    appId,
    authType,
    user,
    apikey: openApiKey
  };
};

// 模型使用权校验
export const authApp = async ({
  appId,
  userId,
  authUser = true,
  authOwner = true
}: {
  appId: string;
  userId: string;
  authUser?: boolean;
  authOwner?: boolean;
}) => {
  // 获取 app 数据
  const app = await App.findById<AppSchema>(appId);
  if (!app) {
    return Promise.reject('App is not exists');
  }

  /* 
    Access verification
    1. authOwner=true or authUser = true ,  just owner can use
    2. authUser = false and share, anyone can use
  */
  if (authOwner || authUser) {
    if (userId !== String(app.userId)) return Promise.reject(ERROR_ENUM.unAuthModel);
  }

  return {
    app,
    showModelDetail: userId === String(app.userId)
  };
};

// 知识库操作权限
export const authKb = async ({ kbId, userId }: { kbId: string; userId: string }) => {
  const kb = await KB.findOne({
    _id: kbId,
    userId
  });
  if (kb) {
    return kb;
  }
  return Promise.reject(ERROR_ENUM.unAuthKb);
};
