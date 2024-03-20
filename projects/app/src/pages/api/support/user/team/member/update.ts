import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { jsonRes } from '@fastgpt/service/common/response';
import { UpdateTeamMemberProps } from '@fastgpt/global/support/user/team/controller';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { role, teamId, memberId, status } = req.body as UpdateTeamMemberProps;
    const obj = {
      ...(role ? { role } : {}),
      ...(status ? { status } : {})
    };
    await MongoTeamMember.updateOne(
      {
        _id: memberId,
        teamId
      },
      obj
    );
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
