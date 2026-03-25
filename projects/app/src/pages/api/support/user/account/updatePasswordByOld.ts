import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';

import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { NextAPI } from '@/service/middleware/entry';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { delUserAllSession } from '@fastgpt/service/support/user/session';
import {
  UpdatePasswordByOldBodySchema,
  type UpdatePasswordByOldBodyType,
  type UpdatePasswordByOldResponseType
} from '@fastgpt/global/openapi/support/user/account/password/api';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';

async function handler(
  req: ApiRequestProps<UpdatePasswordByOldBodyType>,
  res: ApiResponseType<any>
): Promise<UpdatePasswordByOldResponseType> {
  const { oldPsw, newPsw } = UpdatePasswordByOldBodySchema.parse(req.body);

  const { tmbId, teamId, sessionId } = await authCert({ req, authToken: true });
  const tmb = await MongoTeamMember.findById(tmbId);
  if (!tmb) {
    return Promise.reject('can not find it');
  }
  const userId = tmb.userId;
  // auth old password
  const user = await MongoUser.findOne({
    _id: userId,
    password: oldPsw
  });

  if (!user) {
    return Promise.reject(i18nT('common:user.Old password is error'));
  }

  if (oldPsw === newPsw) {
    return Promise.reject(i18nT('common:user.Password has no change'));
  }

  // 更新对应的记录
  await MongoUser.findByIdAndUpdate(userId, {
    password: newPsw,
    passwordUpdateTime: new Date()
  });

  await delUserAllSession(userId, [sessionId]);

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CHANGE_PASSWORD,
      params: {}
    });
  })();
  return user;
}

export default NextAPI(handler);
