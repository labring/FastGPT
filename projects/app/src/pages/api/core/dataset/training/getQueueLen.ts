import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { GetTrainingQueueProps } from '@/global/core/dataset/api';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    await authCert({ req, authToken: true });
    const { vectorModel, agentModel } = req.query as GetTrainingQueueProps;

    // get queue data
    // 分别统计 model = vectorModel和agentModel的数量
    const data = await MongoDatasetTraining.aggregate([
      {
        $match: {
          lockTime: { $lt: new Date('2040/1/1') },
          $or: [{ model: { $eq: vectorModel } }, { model: { $eq: agentModel } }]
        }
      },
      {
        $group: {
          _id: '$model',
          count: { $sum: 1 }
        }
      }
    ]);

    const vectorTrainingCount = data.find((item) => item._id === vectorModel)?.count || 0;
    const agentTrainingCount = data.find((item) => item._id === agentModel)?.count || 0;

    jsonRes(res, {
      data: {
        vectorTrainingCount,
        agentTrainingCount
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
