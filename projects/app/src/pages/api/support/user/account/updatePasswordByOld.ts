import type { NextApiRequest, NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';

import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { NextAPI } from '@/service/middleware/entry';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { oldPsw, newPsw } = req.body as { oldPsw: string; newPsw: string };

  if (!oldPsw || !newPsw) {
    return Promise.reject('Params is missing');
  }

  const { tmbId, teamId } = await authCert({ req, authToken: true });
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
