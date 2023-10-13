import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { TrainingData, connectToDatabase } from '@/service/mongo';
import { authUser } from '@fastgpt/support/user/auth';

/* 拆分数据成QA */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    await authUser({ req, authToken: true });

    // split queue data
    const result = await TrainingData.countDocuments({
      lockTime: { $lt: new Date('2040/1/1') }
    });

    jsonRes(res, {
      data: result
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
