// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { connectToDatabase, TrainingData } from '@/service/mongo';
import { TrainingModeEnum } from '@/constants/plugin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await authUser({ req, authRoot: true });

    await connectToDatabase();

    // split queue data
    const result = await TrainingData.aggregate([
      {
        $group: {
          _id: '$mode',
          count: { $sum: 1 }
        }
      }
    ]);

    jsonRes(res, {
      data: {
        qaListLen: result.find((item) => item._id === TrainingModeEnum.qa)?.count || 0,
        vectorListLen: result.find((item) => item._id === TrainingModeEnum.index)?.count || 0
      }
    });
  } catch (error) {
    console.log(error);
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
