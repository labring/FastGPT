import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { jsonRes } from '@fastgpt/service/common/response';
import { UpdateInviteProps } from '@fastgpt/global/support/user/team/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { tmbId, status } = req.body as UpdateInviteProps;

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
