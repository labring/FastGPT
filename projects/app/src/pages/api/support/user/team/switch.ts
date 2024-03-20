import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import { createJWT, setCookie } from '@fastgpt/service/support/permission/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const params = req.body as { teamId: string };
    const { userId, teamId, tmbId } = await authCert({ req, authToken: true });
    let token = '';
    if (params.teamId) {
      const teamMembers = await MongoTeamMember.find(
        {
          teamId
        },
        { temId: '$_id' }
      );
      if (!teamMembers) {
        throw new Error('找不到团队成员');
      }
      await MongoTeamMember.updateOne(
        {
          teamId,
          userId
        },
        { defaultTeam: false }
      );

      const curTeamMembers = await MongoTeamMember.find({
        teamId: params.teamId
      });
      if (!curTeamMembers) {
        throw new Error('团队成员获取异常');
      }

      if (curTeamMembers.length) {
        await MongoTeamMember.updateMany(
          {
            teamId: params.teamId
          },
          { defaultTeam: true }
        );
      }

      const teamMember = await MongoTeamMember.findOne({
        teamId: params.teamId,
        userId
      });
      if (!teamMember) {
        throw new Error('找不到该团队默认成员');
      }

      const userDetail = await getUserDetail({ tmbId: teamMember._id });

      token = createJWT(userDetail);
    }

    jsonRes(res, {
      data: token
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
