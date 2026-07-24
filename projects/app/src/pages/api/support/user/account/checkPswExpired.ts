import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { checkPswExpired } from '@/service/support/user/account/password';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import type { CheckPswExpiredResponseType } from '@fastgpt/global/openapi/support/user/account/password/api';
import { hasStoredPassword } from '@fastgpt/global/support/user/utils';

async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType
): Promise<CheckPswExpiredResponseType> {
  const { userId, isRoot } = await authCert({ req, authToken: true });

  // root 密码由环境变量管理并在服务重启时同步，不参与用户密码过期策略。
  if (isRoot) {
    return false;
  }

  const user = await MongoUser.findById(userId).select('+password passwordUpdateTime');

  if (!user || !hasStoredPassword(user.password)) {
    return false;
  }

  return checkPswExpired({ updateTime: user.passwordUpdateTime });
}

export default NextAPI(handler);
