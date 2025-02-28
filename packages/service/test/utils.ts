import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

export type TestTokenType = {
  userId: string;
  teamId: string;
  tmbId: string;
  isRoot: boolean;
};

export type TestRequest = {
  headers: {
    cookie?: {
      token?: TestTokenType;
    };
    authorization?: string; // testkey
    rootkey?: string; // rootkey
  };
  query: {
    [key: string]: string;
  };
  body: {
    [key: string]: string;
  };
};

export function getTestRequest<Q = any, B = any>({
  query = {},
  body = {},
  authToken = true,
  // authRoot = false,
  // authApiKey = false,
  user
}: {
  query?: Partial<Q>;
  body?: Partial<B>;
  authToken?: boolean;
  authRoot?: boolean;
  authApiKey?: boolean;
  user?: {
    uid: string;
    tmbId: string;
    teamId: string;
    isRoot: boolean;
  };
}): [any, any] {
  const headers: TestRequest['headers'] = {};
  if (authToken) {
    headers.cookie = {
      token: {
        userId: String(user?.uid || ''),
        teamId: String(user?.teamId || ''),
        tmbId: String(user?.tmbId || ''),
        isRoot: user?.isRoot || false
      }
    };
  }
  return [
    {
      headers,
      query,
      body
    },
    {}
  ];
}

export const parseHeaderCertMock = async ({
  req,
  authToken = true,
  authRoot = false,
  authApiKey = false
}: {
  req: TestRequest;
  authToken?: boolean;
  authRoot?: boolean;
  authApiKey?: boolean;
}): Promise<TestTokenType> => {
  if (authToken) {
    const token = req.headers?.cookie?.token;
    if (!token) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }
    return token;
  }
  // if (authRoot) {
  //   // TODO: unfinished
  //   return req.headers.rootkey;
  // }
  // if (authApiKey) {
  //   // TODO: unfinished
  //   return req.headers.authorization;
  // }
  return {} as any;
};
