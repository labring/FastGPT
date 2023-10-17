import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import type { OutLinkEditType } from '@fastgpt/global/support/outLink/type.d';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    const { _id, name, responseDetail, limit } = req.body as OutLinkEditType & {};

    await MongoOutLink.findByIdAndUpdate(_id, {
      name,
      responseDetail,
      limit
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
