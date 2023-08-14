import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { TrainingData } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';

/* 拆分数据成QA */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
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
