import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { QueryUserParams } from '@/global/support/api/userRes';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    let { pageNum = 1, pageSize = 10, status } = req.query as QueryUserParams;
    const match = {
      ...(status ? { status } : {})
    };
    const { userId } = await authCert({ req, authToken: true });

    // 找出用户的所在团队
    const userTeamMembers = await MongoTeamMember.find({
      userId
    });

    let teams = [];
    for (const userTeamMember of userTeamMembers) {
      const team = await MongoTeam.findOne(
        {
          _id: userTeamMember.teamId,
          ...{ match }
        },
        { teamName: '$name', teamId: '$_id', ownerId: 1, avatar: 1, balance: 1, maxSize: 1 }
      );
      if (team) {
        teams.push(team);
      }
    }

    jsonRes(res, {
      data: teams
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
