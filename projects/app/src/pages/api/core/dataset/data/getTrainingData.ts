import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, TrainingData } from '@/service/mongo';
import { authUser } from '@fastgpt/support/user/auth';
import { TrainingModeEnum } from '@/constants/plugin';
import { Types } from '@fastgpt/common/mongo';
import { startQueue } from '@/service/utils/tools';

/* 拆分数据成QA */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { kbId, init = false } = req.body as { kbId: string; init: boolean };
    if (!kbId) {
      throw new Error('参数错误');
    }

    const { userId } = await authUser({ req, authToken: true });

    // split queue data
    const result = await TrainingData.aggregate([
      {
        $match: {
          userId: new Types.ObjectId(userId),
          kbId: new Types.ObjectId(kbId)
        }
      },
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

    if (init) {
      startQueue();
    }
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
