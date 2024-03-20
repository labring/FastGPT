import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { jsonRes } from '@fastgpt/service/common/response';
import { PostLoginProps } from '@fastgpt/global/support/user/api';
import { authUserExist, getUserDetail } from '@fastgpt/service/support/user/controller';
import { createDefaultTeam } from '@fastgpt/service/support/user/team/controller';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { username, password, tmbId = '', status } = req.body as PostLoginProps;

    if (!username || !password) {
      throw new Error('缺少参数');
    }

    // 检测用户是否存在
    const hasUser = await authUserExist({ username });
    if (hasUser) {
      throw new Error('用户已注册');
    }
    const user = await MongoUser.create({
      username,
      password,
      status
    });
    await createDefaultTeam({ userId: user._id, role: TeamMemberRoleEnum.owner });
    const userDetail = await getUserDetail({ tmbId: '', userId: user._id });
    jsonRes(res, {
      data: {
        user: userDetail
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
