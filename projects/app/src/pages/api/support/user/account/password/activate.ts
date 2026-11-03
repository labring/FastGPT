import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  ActivateAccountBodySchema,
  type ActivateAccountBody
} from '@fastgpt/global/openapi/support/user/account/password/api';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getPasswordLoginMinuteLimitCount } from '@fastgpt/service/common/system/constants';
import { assertPasswordUpdateRateLimit } from '@fastgpt/service/common/rateLimit/interface/accountVerification';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import {
  assertUserPasswordAvailable,
  activateAccount
} from '@fastgpt/service/support/user/account/password/service';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { delUserAllSession } from '@fastgpt/service/support/user/session';
import { withUserLock } from '@fastgpt/service/support/user/lock';
import { NextAPI } from '@/service/middleware/entry';

/** 未激活账号首次设置密码；该入口不校验旧密码，也不限制其他 API 的使用。 */
async function handler(req: ApiRequestProps<ActivateAccountBody>): Promise<void> {
  const { body } = parseApiInput({ req, bodySchema: ActivateAccountBodySchema });
  const { userId, sessionId, tmbId, teamId } = await authCert({
    req,
    authToken: true
  });
  if (!sessionId) return Promise.reject(ERROR_ENUM.unAuthorization);

  await assertPasswordUpdateRateLimit({
    account: userId,
    // 与验证码 create/consume 限流共用 helper：实例配置权威、缺省回落 env
    limit: getPasswordLoginMinuteLimitCount()
  });

  await withUserLock(userId, async () => {
    const user = await MongoUser.findById(userId);
    if (!user) throw new Error('Failed to activate account');
    assertUserPasswordAvailable(user.username);

    await activateAccount({
      userId,
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
