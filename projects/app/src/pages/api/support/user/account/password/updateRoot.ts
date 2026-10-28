import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  UpdateRootPasswordBodySchema,
  type UpdateRootPasswordBody
} from '@fastgpt/global/openapi/support/user/account/password/api';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { UserError } from '@fastgpt/global/common/error/utils';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { hasStoredPassword } from '@fastgpt/global/support/user/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { serviceEnv } from '@fastgpt/service/env';
import { assertPasswordUpdateRateLimit } from '@fastgpt/service/common/rateLimit/interface/accountVerification';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { updateRootPassword } from '@fastgpt/service/support/user/account/password/service';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { delUserAllSession } from '@fastgpt/service/support/user/session';
import { withUserLock } from '@fastgpt/service/support/user/lock';
import { NextAPI } from '@/service/middleware/entry';

/**
 * 开源版专用：仅允许已登录的 root 账号通过校验旧密码更新自身密码，并仅保留发起请求的 Session。
 * 商业版（isPlus）的 root 与普通用户均走标准认证改密接口 `/support/user/account/password/update`。
 */
async function handler(req: ApiRequestProps<UpdateRootPasswordBody>): Promise<void> {
  const { body } = parseApiInput({ req, bodySchema: UpdateRootPasswordBodySchema });
  const { userId, sessionId, tmbId, teamId, isRoot } = await authCert({
    req,
    authToken: true
  });
  if (!sessionId || !isRoot || global.feConfigs?.isPlus) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  await assertPasswordUpdateRateLimit({
    account: userId,
    limit: serviceEnv.PASSWORD_LOGIN_MINUTE_LIMIT_COUNT
  });

  await withUserLock(userId, async () => {
    // password 字段为 select:false；用 lean 取原始存储值，避免 getter 再次哈希干扰“是否已有密码”的判断。
    const user = await MongoUser.findById(userId).select('+password username').lean();
    if (!user || user.username !== 'root') {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }

    const needsOldPassword = hasStoredPassword(user.password);
    if (needsOldPassword && !body.oldPsw) {
      throw new UserError(UserErrEnum.oldPasswordError);
    }

    await updateRootPassword({
      userId,
      oldPassword: needsOldPassword ? body.oldPsw : undefined,
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
