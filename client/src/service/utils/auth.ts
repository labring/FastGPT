import type { NextApiRequest } from 'next';
import jwt from 'jsonwebtoken';
import Cookie from 'cookie';
import { App, OpenApi, User, OutLink, KB } from '../mongo';
import type { AppSchema, UserModelSchema } from '@/types/mongoSchema';
import { formatPrice } from '@/utils/user';
import { ERROR_ENUM } from '../errorCode';

export type AuthType = 'token' | 'root' | 'apikey';

export const parseCookie = (cookie?: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    // 获取 cookie
    const cookies = Cookie.parse(cookie || '');
    const token = cookies.token;

    if (!token) {
      return reject(ERROR_ENUM.unAuthorization);
    }

    const key = process.env.TOKEN_KEY as string;

    jwt.verify(token, key, function (err, decoded: any) {
      if (err || !decoded?.userId) {
        reject(ERROR_ENUM.unAuthorization);
        return;
      }
      resolve(decoded.userId);
    });
  });
};

/* auth balance */
export const authBalanceByUid = async (uid: string) => {
  const user = await User.findById(uid);
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

  const { cookie, apikey, rootkey, userid, authorization } = (req.headers || {}) as {
    cookie?: string;
    apikey?: string;
    rootkey?: string;
    userid?: string;
    authorization?: string;
  };

  let uid = '';
  let appId = '';
  let authType: AuthType = 'token';

  if (authToken) {
    uid = await parseCookie(cookie);
    authType = 'token';
  } else if (authRoot) {
    uid = await parseRootKey(rootkey, userid);
    authType = 'root';
  } else if (cookie) {
    uid = await parseCookie(cookie);
    authType = 'token';
  } else if (apikey) {
    uid = await parseOpenApiKey(apikey);
    authType = 'apikey';
  } else if (authorization) {
    const authResponse = await parseAuthorization(authorization);
    uid = authResponse.uid;
    appId = authResponse.appId;
    authType = 'apikey';
  } else if (rootkey) {
    uid = await parseRootKey(rootkey, userid);
    authType = 'root';
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
    userId: uid,
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
  // 获取 model 数据
  const app = await App.findById<AppSchema>(appId);
  if (!app) {
    return Promise.reject('模型不存在');
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

export const authShareChat = async ({ shareId }: { shareId: string }) => {
  // get shareChat
  const shareChat = await OutLink.findOne({ shareId });

  if (!shareChat) {
    return Promise.reject('分享链接已失效');
  }

  const uid = String(shareChat.userId);

  // authBalance
  const user = await authBalanceByUid(uid);

  return {
    user,
    userId: String(shareChat.userId),
    appId: String(shareChat.appId),
    authType: 'token' as AuthType
  };
};
