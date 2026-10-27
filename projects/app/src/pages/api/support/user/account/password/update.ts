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
import { hasStoredPassword } from '@fastgpt/global/support/user/utils';
import { delUserAllSession } from '@fastgpt/service/support/user/session';
import { withUserLock } from '@fastgpt/service/support/user/lock';
import { NextAPI } from '@/service/middleware/entry';

/**
 * 使用当前登录 Session 更新密码，并仅保留发起请求的 Session。
 * isPlus 时必须提交认证后签发的一次性改密 Session；开源版没有认证服务，改为校验旧密码。
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
    // password 字段为 select:false；用 lean 取原始存储值，避免 getter 再次哈希干扰“是否已有密码”的判断。
    const user = await MongoUser.findById(userId).select('+password username').lean();
    if (!user) throw new Error('Failed to update password');
    assertUserPasswordAvailable(user.username);

    // 商业版必须先通过认证，不能仅凭登录 Session 改密。
    const isPlus = global.feConfigs?.isPlus;
    const needsOldPassword = !isPlus && hasStoredPassword(user.password);
    if (isPlus) {
      if (!body.passwordChangeSession) {
        throw new UserError(UserErrEnum.passwordChangeAuthorizationInvalid);
      }
    } else if (needsOldPassword && !body.oldPsw) {
      // 开源版没有认证服务，旧密码是改密唯一的身份凭证；首次设置密码时不存在旧密码。
      throw new UserError(UserErrEnum.oldPasswordError);
    }

    await updatePassword({
      sessionId: body.passwordChangeSession,
      userId,
      loginSessionId: sessionId,
      newPassword: body.newPsw,
      // 商业版身份已由一次性 Session 证明，不再重复要求旧密码。
      oldPassword: needsOldPassword ? body.oldPsw : undefined
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
