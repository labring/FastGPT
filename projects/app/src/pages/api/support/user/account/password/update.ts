import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  UpdatePasswordBodySchema,
  type UpdatePasswordBody
} from '@fastgpt/global/openapi/support/user/account/password/api';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { serviceEnv } from '@fastgpt/service/env';
import { assertPasswordUpdateRateLimit } from '@fastgpt/service/common/rateLimit/interface/accountVerification';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { updatePasswordWithChangeSession } from '@fastgpt/service/support/user/account/password/service';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { delUserAllSession } from '@fastgpt/service/support/user/session';
import { withUserLock } from '@fastgpt/service/support/user/lock';
import { NextAPI } from '@/service/middleware/entry';

/** 使用当前登录 Session 和一次性改密 Session 更新密码，并仅保留发起请求的 Session。 */
async function handler(req: ApiRequestProps<UpdatePasswordBody>): Promise<void> {
  const { body } = parseApiInput({ req, bodySchema: UpdatePasswordBodySchema });
  const { userId, sessionId, tmbId, teamId, isRoot } = await authCert({
    req,
    authToken: true
  });
  if (!sessionId || isRoot) return Promise.reject(ERROR_ENUM.unAuthorization);

  await assertPasswordUpdateRateLimit({
    account: userId,
    limit: serviceEnv.PASSWORD_LOGIN_MINUTE_LIMIT_COUNT
  });

  await withUserLock(userId, async () => {
    await updatePasswordWithChangeSession({
      sessionId: body.passwordChangeSession,
      userId,
      loginSessionId: sessionId,
      newPassword: body.newPsw
    });

    await delUserAllSession(userId, [sessionId]);
  });
  void addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.CHANGE_PASSWORD,
    params: {}
  });
}

export default NextAPI(handler);
