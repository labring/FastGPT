import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { checkPswExpired } from '@/service/support/user/account/password';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import type { CheckPswExpiredResponseType } from '@fastgpt/global/openapi/support/user/account/password/api';

async function handler(
  req: ApiRequestProps,
  res: ApiResponseType
): Promise<CheckPswExpiredResponseType> {
  const { userId } = await authCert({ req, authToken: true });

  const user = await MongoUser.findById(userId, 'passwordUpdateTime');

  if (!user) {
    return false;
  }

  return checkPswExpired({ updateTime: user.passwordUpdateTime });
}

export default NextAPI(handler);
