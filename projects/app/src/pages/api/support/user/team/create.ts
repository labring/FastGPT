import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { CreateTeamProps } from '@fastgpt/global/support/user/team/controller';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { name, avatar, defaultTeam, username } = req.body as CreateTeamProps;
    const { userId } = await authCert({ req, authToken: true });

    const { _id } = await MongoTeam.create({
      name,
      avatar,
      ownerId: userId
    });

    // 新创建团队要把所有者加入到该团队中
    await MongoTeamMember.create({
      role: 'owner',
      teamId: _id,
      userId,
      name: username,
      status: TeamMemberStatusEnum.active,
      createTime: new Date()
    });

    jsonRes(res, {
      data: {}
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
