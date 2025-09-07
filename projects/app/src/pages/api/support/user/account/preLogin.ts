import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { UserAuthTypeEnum } from '@fastgpt/global/support/user/auth/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { addSeconds } from 'date-fns';
import { addAuthCode } from '@fastgpt/service/support/user/auth/controller';
import { UserError } from '@fastgpt/global/common/error/utils';

export type preLoginQuery = {
  username: string;
};

export type preLoginBody = {};

export type preLoginResponse = { code: string };

async function handler(
  req: ApiRequestProps<preLoginBody, preLoginQuery>,
  res: ApiResponseType<any>
): Promise<preLoginResponse> {
  const { username } = req.query;

  if (!username) {
    return Promise.reject(new UserError('username is required'));
  }

  const code = getNanoid(6);

  await addAuthCode({
    type: UserAuthTypeEnum.login,
    key: username,
    code,
    expiredTime: addSeconds(new Date(), 30)
  });

  return {
    code
  };
}

export default NextAPI(handler);
