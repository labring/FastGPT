import type { NextApiRequest, NextApiResponse } from 'next';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { setCookie } from '@fastgpt/service/support/permission/controller';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import type { PostLoginProps } from '@fastgpt/global/support/user/api.d';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { NextAPI } from '@/service/middleware/entry';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { UserAuthTypeEnum } from '@fastgpt/global/support/user/auth/constants';
import { authCode } from '@fastgpt/service/support/user/auth/controller';
import { createUserSession } from '@fastgpt/service/support/user/session';
import requestIp from 'request-ip';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { username, password, code } = req.body as PostLoginProps;

  if (!username || !password || !code) {
    return Promise.reject(CommonErrEnum.invalidParams);
  }

  // Auth prelogin code
  await authCode({
    key: username,
    code,
    type: UserAuthTypeEnum.login
  });

  // 检测用户是否存在
  const authCert = await MongoUser.findOne(
    {
      username
    },
    'status'
  );
  if (!authCert) {
    return Promise.reject(UserErrEnum.account_psw_error);
  }

  if (authCert.status === UserStatusEnum.forbidden) {
    return Promise.reject('Invalid account!');
  }

  const user = await MongoUser.findOne({
    username,
    password
  });

  if (!user) {
    return Promise.reject(UserErrEnum.account_psw_error);
  }

  const userDetail = await getUserDetail({
    tmbId: user?.lastLoginTmbId,
    userId: user._id
  });

  MongoUser.findByIdAndUpdate(user._id, {
    lastLoginTmbId: userDetail.team.tmbId
  });

  const token = await createUserSession({
    userId: user._id,
    teamId: userDetail.team.teamId,
    tmbId: userDetail.team.tmbId,
    isRoot: username === 'root',
    ip: requestIp.getClientIp(req)
  });

  setCookie(res, token);

  pushTrack.login({
    type: 'password',
    uid: user._id,
    teamId: userDetail.team.teamId,
    tmbId: userDetail.team.tmbId
  });
  addAuditLog({
    tmbId: userDetail.team.tmbId,
    teamId: userDetail.team.teamId,
    event: AuditEventEnum.LOGIN
  });

  return {
    user: userDetail,
    token
  };
}

const lockTime = Number(process.env.PASSWORD_LOGIN_LOCK_SECONDS || 120);
export default NextAPI(
  useIPFrequencyLimit({ id: 'login-by-password', seconds: lockTime, limit: 10, force: true }),
  handler
);
