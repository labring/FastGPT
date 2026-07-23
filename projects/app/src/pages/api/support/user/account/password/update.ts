import type { ApiRequestProps } from '@fastgpt/next/type';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import {
  UpdatePasswordBodySchema,
  UpdatePasswordResponseSchema,
  type UpdatePasswordBody,
  type UpdatePasswordResponse
} from '@fastgpt/global/openapi/support/user/account/password/api';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { hasStoredPassword } from '@fastgpt/global/support/user/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { passwordChangeTokenService } from '@fastgpt/service/support/user/account/password/service';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { delUserAllSession } from '@fastgpt/service/support/user/session';
import { NextAPI } from '@/service/middleware/entry';

/** 使用当前 Session 和短期改密授权更新密码，并仅保留发起请求的 Session。 */
async function handler(req: ApiRequestProps<UpdatePasswordBody>): Promise<UpdatePasswordResponse> {
  const { body } = parseApiInput({ req, bodySchema: UpdatePasswordBodySchema });
  const { userId, sessionId, tmbId, teamId } = await authCert({ req, authToken: true });

  passwordChangeTokenService.verify({ token: body.passwordChangeToken, userId });

  const user = await MongoUser.findById(userId).select('+password');
  if (!user) throw new Error('Failed to update password');

  if (hasStoredPassword(user.password)) {
    const isSamePassword = await MongoUser.exists({ _id: userId, password: body.newPsw });
    if (isSamePassword) {
      throw new Error(i18nT('common:user.Password has no change'));
    }
  }

  const updateResult = await MongoUser.updateOne(
    { _id: userId },
    {
      $set: {
        password: body.newPsw,
        passwordUpdateTime: new Date()
      }
    }
  );
  if (updateResult.matchedCount !== 1) throw new Error('Failed to update password');

  await delUserAllSession(userId, [sessionId]);
  void addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.CHANGE_PASSWORD,
    params: {}
  });

  return UpdatePasswordResponseSchema.parse(undefined);
}

export default NextAPI(handler);
