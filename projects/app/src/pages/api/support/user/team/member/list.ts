import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    let { teamId } = req.query as { teamId: string };
    const teamMembers = await MongoTeamMember.find(
      {
        teamId
      },
      { memberName: '$name', tmbId: '$_id', teamId: 1, userId: 1, role: 1, status: 1 }
    );
    jsonRes(res, {
      data: teamMembers
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
