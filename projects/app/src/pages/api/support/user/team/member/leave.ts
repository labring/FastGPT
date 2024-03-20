import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { teamId } = req.query as { teamId: string };
    const { userId } = await authCert({ req, authToken: true });
    await MongoTeamMember.deleteOne({
      userId,
      teamId
    });

    let defaultTeamId = '';
    const defaultTeamMember = await MongoTeamMember.findOne({
      userId
    });
    if (!defaultTeamMember) {
      // throw new Error('找不到默认团队中的成员！')
      defaultTeamId = '';
    } else {
      await MongoTeamMember.updateOne(
        {
          userId,
          teamId: defaultTeamMember.teamId
        },
        { defaultTeam: true }
      );

      defaultTeamId = defaultTeamMember.teamId;
    }
    jsonRes(res, {
      data: {
        teamId: defaultTeamId
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
