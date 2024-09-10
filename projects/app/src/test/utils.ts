import { UserModelSchema } from '@fastgpt/global/support/user/type';

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

export function getTestRequest({
  query = {},
  body = {},
  authToken = false,
  authRoot = false,
  authApiKey = false,
  user
}: {
  body: any;
  headers: any;
  query: any;
  authToken?: boolean;
  authRoot?: boolean;
  authApiKey?: boolean;
  user?: UserModelSchema;
}) {
  const headers: TestRequest['headers'] = {};
  if (authToken) {
    headers.cookie = {
      token: {
        userId: user?._id || '',
        teamId: '',
        tmbId: '',
        isRoot: false
      }
    };
  }
  return {
    query,
    body
  };
}
