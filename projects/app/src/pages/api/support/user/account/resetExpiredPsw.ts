import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { NextAPI } from '@/service/middleware/entry';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { checkPswExpired } from '@/service/support/user/account/password';
import { delUserAllSession } from '@fastgpt/service/support/user/session';

export type resetExpiredPswQuery = {};

export type resetExpiredPswBody = {
  newPsw: string;
};

export type resetExpiredPswResponse = {};

async function resetExpiredPswHandler(
  req: ApiRequestProps<resetExpiredPswBody, resetExpiredPswQuery>,
  res: ApiResponseType<resetExpiredPswResponse>
): Promise<resetExpiredPswResponse> {
  const newPsw = req.body.newPsw;
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

  return {};
}

export default NextAPI(resetExpiredPswHandler);
