import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, OutLink } from '@/service/mongo';
import type { OutLinkEditType } from '@/types/support/outLink';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    const { _id, name, responseDetail, limit } = req.body as OutLinkEditType & {};

    await OutLink.findByIdAndUpdate(_id, {
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
