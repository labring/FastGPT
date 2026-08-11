import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { checkPswExpired } from '@/service/support/user/account/password';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { userRepository } from '@fastgpt/service/common/dal';
import type { CheckPswExpiredResponseType } from '@fastgpt/global/openapi/support/user/account/password/api';

async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType
): Promise<CheckPswExpiredResponseType> {
  const { userId } = await authCert({ req, authToken: true });

  const updateTime = await userRepository.findPasswordUpdateTimeById(userId);

  if (!updateTime) {
    return false;
  }

  return checkPswExpired({ updateTime: updateTime.passwordUpdateTime });
}

export default NextAPI(handler);
