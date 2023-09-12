import type { NextApiRequest } from 'next';
import Cookie from 'cookie';
import { App, OpenApi, User, OutLink, KB } from '../mongo';
import type { AppSchema, UserModelSchema } from '@/types/mongoSchema';
import { ERROR_ENUM } from '../errorCode';
import { authJWT } from './tools';

export enum AuthUserTypeEnum {
  token = 'token',
  root = 'root',
  apikey = 'apikey'
}

export const authCookieToken = async (cookie?: string, token?: string): Promise<string> => {
  // 获取 cookie
  const cookies = Cookie.parse(cookie || '');
  const cookieToken = cookies.token || token;

  if (!cookieToken) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  return await authJWT(cookieToken);
};

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
  authBalance = false
}: {
  req: NextApiRequest;
  authToken?: boolean;
  authRoot?: boolean;
  authBalance?: boolean;
}) => {
  const parseOpenApiKey = async (apiKey?: string) => {
    if (!apiKey) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }

    try {
      const openApi = await OpenApi.findOne({ apiKey });
      if (!openApi) {
        return Promise.reject(ERROR_ENUM.unAuthorization);
      }
      const userId = String(openApi.userId);

      // 更新使用的时间
      await OpenApi.findByIdAndUpdate(openApi._id, {
        lastUsedTime: new Date()
      });

      return userId;
    } catch (error) {
      return Promise.reject(error);
    }
  };
  const parseAuthorization = async (authorization?: string) => {
    if (!authorization) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }

    // Bearer fastgpt-xxxx-appId
    const auth = authorization.split(' ')[1];
    if (!auth) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }

    const { apiKey, appId } = await (async () => {
      const arr = auth.split('-');
      if (arr.length !== 3) {
        return Promise.reject(ERROR_ENUM.unAuthorization);
      }
      return {
        apiKey: `${arr[0]}-${arr[1]}`,
        appId: arr[2]
      };
    })();

    // auth apiKey
    const uid = await parseOpenApiKey(apiKey);

    return {
      uid,
      appId
    };
  };
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
    rootkey?: string;
    userid?: string;
    authorization?: string;
  };

  let uid = '';
  let appId = '';
  let authType: `${AuthUserTypeEnum}` = AuthUserTypeEnum.token;

  if (authToken) {
    uid = await authCookieToken(cookie, token);
    authType = AuthUserTypeEnum.token;
  } else if (authRoot) {
    uid = await parseRootKey(rootkey, userid);
    authType = AuthUserTypeEnum.root;
  } else if (cookie || token) {
    uid = await authCookieToken(cookie, token);
    authType = AuthUserTypeEnum.token;
  } else if (apikey) {
    uid = await parseOpenApiKey(apikey);
    authType = AuthUserTypeEnum.apikey;
  } else if (authorization) {
    const authResponse = await parseAuthorization(authorization);
    uid = authResponse.uid;
    appId = authResponse.appId;
    authType = AuthUserTypeEnum.apikey;
  } else if (rootkey) {
    uid = await parseRootKey(rootkey, userid);
    authType = AuthUserTypeEnum.root;
  } else {
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
    user
  };
};

// 模型使用权校验
export const authApp = async ({
  appId,
  userId,
  authUser = true,
  authOwner = true,
  reserveDetail = false
}: {
  appId: string;
  userId: string;
  authUser?: boolean;
  authOwner?: boolean;
  reserveDetail?: boolean; // focus reserve detail
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
  if (authOwner || (authUser && !app.share.isShare)) {
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
