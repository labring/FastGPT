import type { ApiRequestProps } from '@fastgpt/next/type';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { userRepository } from '@fastgpt/service/common/dal';
import { NextAPI } from '@/service/middleware/entry';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { checkPswExpired } from '@/service/support/user/account/password';
import { delUserAllSession } from '@fastgpt/service/support/user/session';
import {
  ResetExpiredPswBodySchema,
  ResetExpiredPswResponseSchema,
  type ResetExpiredPswResponseType
} from '@fastgpt/global/openapi/support/user/account/password/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function resetExpiredPswHandler(req: ApiRequestProps): Promise<ResetExpiredPswResponseType> {
  const { body } = parseApiInput({ req, bodySchema: ResetExpiredPswBodySchema });
  const { newPsw } = body;
  const { userId, sessionId } = await authCert({ req, authToken: true });
  const updateTime = await userRepository.findPasswordUpdateTimeById(userId);

  if (!updateTime) {
    return Promise.reject('The password has not expired');
  }

  // check if can reset password
  const canReset = checkPswExpired({ updateTime: updateTime.passwordUpdateTime });

  if (!canReset) {
    return Promise.reject(i18nT('common:user.No_right_to_reset_password'));
  }

  // 更新对应的记录
  await userRepository.updateById(userId, {
    password: newPsw,
    passwordUpdateTime: new Date()
  });

  await delUserAllSession(userId, [sessionId]);

  return ResetExpiredPswResponseSchema.parse(undefined);
}

export default NextAPI(resetExpiredPswHandler);
