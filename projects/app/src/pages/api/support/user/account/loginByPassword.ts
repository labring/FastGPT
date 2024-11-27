import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { createJWT, setCookie } from '@fastgpt/service/support/permission/controller';
import { connectToDatabase } from '@/service/mongo';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import type { PostLoginProps } from '@fastgpt/global/support/user/api.d';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import isLoginLocked, { addLoginLog } from '@fastgpt/service/common/system/log';
import { LoginStatusEnum } from '@fastgpt/service/common/system/loginLog/constant';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { username, password } = req.body as PostLoginProps;

    if (!username || !password) {
      throw new Error('缺少参数');
    }

    // 检测用户是否存在
    const authCert = await MongoUser.findOne(
      {
        username
      },
      'status'
    );
    if (!authCert) {
      //用户未注册
      throw new Error('用户名或密码错误');
    }

    if (authCert.status === UserStatusEnum.forbidden) {
      addLoginLog.login(username, LoginStatusEnum.failure, '账号已停用');
      throw new Error('账号已停用，无法登录');
    }
    const isLocked = await isLoginLocked(username);
    if (isLocked) {
      throw new Error('登录失败超过5次，用户已锁定，请15分钟后再试');
    }
    const user = await MongoUser.findOne({
      username,
      password
    });

    if (!user) {
      addLoginLog.login(username, LoginStatusEnum.failure, '密码错误');
      //密码错误
      throw new Error('用户名或密码错误');
    }

    addLoginLog.login(username, LoginStatusEnum.success, '登录成功');
    const userDetail = await getUserDetail({
      tmbId: user?.lastLoginTmbId,
      userId: user._id
    });

    MongoUser.findByIdAndUpdate(user._id, {
      lastLoginTmbId: userDetail.team.tmbId
    });

    const token = createJWT({
      ...userDetail,
      isRoot: username === 'root'
    });

    setCookie(res, token);

    jsonRes(res, {
      data: {
        user: userDetail,
        token
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
