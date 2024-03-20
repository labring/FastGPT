import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { connectToDatabase } from '@/service/mongo';
import { createDefaultTeam } from '@fastgpt/service/support/user/team/controller';
import { authUserExist, getUserDetail } from '@fastgpt/service/support/user/controller';
import type { PostLoginProps } from '@fastgpt/global/support/user/api.d';
import { createJWT, setCookie } from '@fastgpt/service/support/permission/controller';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { username, password, tmbId = '' } = req.body as PostLoginProps;

    if (!username || !password) {
      throw new Error('缺少参数');
    }

    // 检测用户是否存在
    const hasUser = await authUserExist({ username });
    if (hasUser) {
      throw new Error('用户已注册');
    }

    const { _id: userId } = await MongoUser.create({
      username,
      password
    });
    await createDefaultTeam({ userId, role: TeamMemberRoleEnum.owner });
    const userDetail = await getUserDetail({ tmbId: '', userId: userId });

    const token = createJWT(userDetail);
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
