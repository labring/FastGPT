import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { NextAPI } from '@/service/middleware/entry';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { checkPswExpired } from '@/service/support/user/account/password';
import { delUserAllSession } from '@fastgpt/service/support/user/session';
import {
  ResetExpiredPswBodySchema,
  ResetExpiredPswResponseSchema,
  type ResetExpiredPswResponseType
} from '@fastgpt/global/openapi/support/user/account/password/api';

async function resetExpiredPswHandler(req: ApiRequestProps): Promise<ResetExpiredPswResponseType> {
  const { newPsw } = ResetExpiredPswBodySchema.parse(req.body);
  const { userId, sessionId } = await authCert({ req, authToken: true });
  const user = await MongoUser.findById(userId, 'passwordUpdateTime').lean();

  if (!user) {
    return Promise.reject('The password has not expired');
  }

  // check if can reset password
  const canReset = checkPswExpired({ updateTime: user.passwordUpdateTime });

  if (!canReset) {
    return Promise.reject(i18nT('common:user.No_right_to_reset_password'));
  }

  // 更新对应的记录
  await MongoUser.updateOne(
    {
      _id: userId
    },
    {
      password: newPsw,
      passwordUpdateTime: new Date()
    }
  );

  await delUserAllSession(userId, [sessionId]);

  return ResetExpiredPswResponseSchema.parse(undefined);
}

export default NextAPI(resetExpiredPswHandler);
