import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  UpdatePasswordBodySchema,
  type UpdatePasswordBody
} from '@fastgpt/global/openapi/support/user/account/password/api';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { UserError } from '@fastgpt/global/common/error/utils';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { serviceEnv } from '@fastgpt/service/env';
import { assertPasswordUpdateRateLimit } from '@fastgpt/service/common/rateLimit/interface/accountVerification';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import {
  assertUserPasswordAvailable,
  updatePassword
} from '@fastgpt/service/support/user/account/password/service';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { delUserAllSession } from '@fastgpt/service/support/user/session';
import { withUserLock } from '@fastgpt/service/support/user/lock';
import { NextAPI } from '@/service/middleware/entry';

/**
 * 使用当前登录 Session 更新密码，并仅保留发起请求的 Session。
 * isPlus时必须提交认证后签发的一次性改密 Session。
 */
async function handler(req: ApiRequestProps<UpdatePasswordBody>): Promise<void> {
  const { body } = parseApiInput({ req, bodySchema: UpdatePasswordBodySchema });
  const { userId, sessionId, tmbId, teamId } = await authCert({
    req,
    authToken: true
  });
  if (!sessionId) return Promise.reject(ERROR_ENUM.unAuthorization);

  await assertPasswordUpdateRateLimit({
    account: userId,
    limit: serviceEnv.PASSWORD_LOGIN_MINUTE_LIMIT_COUNT
  });

  await withUserLock(userId, async () => {
    // 开启 SSO 禁用密码策略后，受限 SSO 用户不允许继续维护平台密码。
    const user = await MongoUser.findById(userId);
    if (!user) throw new Error('Failed to update password');
    assertUserPasswordAvailable(user.username);

    // isPlus时必须先通过认证，不能仅凭登录 Session 改密。
    if (!body.passwordChangeSession && global.feConfigs?.isPlus) {
      throw new UserError(UserErrEnum.passwordChangeAuthorizationInvalid);
    }
    await updatePassword({
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
