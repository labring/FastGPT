import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoUserAuth } from '@fastgpt/global/support/user/auth/schema';
import { UserAuthTypeEnum } from '@fastgpt/global/support/user/auth/constants';
import { nanoid } from 'nanoid';

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
    return Promise.reject('username is required');
  }

  let answer = nanoid(6);

  await MongoUserAuth.updateOne(
    {
      key: username,
      type: UserAuthTypeEnum.login
    },
    {
      code: answer.toLowerCase(),
      createTime: new Date(), // reset time
      outdateTime: new Date(Date.now() + 30 * 1000) // reset outdateTime
    },
    {
      upsert: true
    }
  );

  return {
    code: answer
  };
}

export default NextAPI(handler);
