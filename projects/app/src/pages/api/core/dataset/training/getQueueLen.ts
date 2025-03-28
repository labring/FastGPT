import type { NextApiRequest } from 'next';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextAPI } from '@/service/middleware/entry';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';

export type GetQueueLenResponse = {
  vectorTrainingCount: number;
  qaTrainingCount: number;
  autoTrainingCount: number;
  imageTrainingCount: number;
};

async function handler(req: NextApiRequest) {
  await authCert({ req, authToken: true });

  // get queue data
  const data = await MongoDatasetTraining.aggregate(
    [
      {
        $match: {
          lockTime: { $lt: new Date('2040/1/1') }
        }
      },
      {
        $group: {
          _id: '$mode',
          count: { $sum: 1 }
        }
      }
    ],
    {
      ...readFromSecondary
    }
  );

  const vectorTrainingCount = data.find((item) => item._id === TrainingModeEnum.chunk)?.count || 0;
  const qaTrainingCount = data.find((item) => item._id === TrainingModeEnum.qa)?.count || 0;
  const autoTrainingCount = data.find((item) => item._id === TrainingModeEnum.auto)?.count || 0;
  const imageTrainingCount = data.find((item) => item._id === TrainingModeEnum.image)?.count || 0;

  return {
    vectorTrainingCount,
    qaTrainingCount,
    autoTrainingCount,
    imageTrainingCount
  };
}

export default NextAPI(handler);
