import type { NextApiRequest, NextApiResponse } from 'next';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { createJWT, setCookie } from '@fastgpt/service/support/permission/controller';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import type { PostLoginProps } from '@fastgpt/global/support/user/api.d';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { NextAPI } from '@/service/middleware/entry';
import { useReqFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { username, password } = req.body as PostLoginProps;

  if (!username || !password) {
    return Promise.reject(CommonErrEnum.invalidParams);
  }

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

  pushTrack.login({
    type: 'password',
    uid: user._id,
    teamId: userDetail.team.teamId,
    tmbId: userDetail.team.tmbId
  });

  const token = createJWT({
    ...userDetail,
    isRoot: username === 'root'
  });

  setCookie(res, token);

  return {
    user: userDetail,
    token
  };
}

export default NextAPI(useReqFrequencyLimit(120, 10, true), handler);
