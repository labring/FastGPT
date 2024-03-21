import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    let { name, teamId } = req.body as { name: string; teamId: string };

    await MongoTeam.updateOne(
      {
        _id: teamId
      },
      {
        name
      }
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
