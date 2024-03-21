import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { jsonRes } from '@fastgpt/service/common/response';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
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
