import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, TrainingData } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { Types } from 'mongoose';
import { generateQA } from '@/service/events/generateQA';
import { generateVector } from '@/service/events/generateVector';

/* 拆分数据成QA */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { kbId, init = false } = req.body as { kbId: string; init: boolean };
    if (!kbId) {
      throw new Error('参数错误');
    }
    await connectToDatabase();

    const { userId } = await authUser({ req, authToken: true });

    // split queue data
    const result = await TrainingData.aggregate([
      { $match: { userId: new Types.ObjectId(userId), kbId: new Types.ObjectId(kbId) } },
      {
        $project: {
          qaListLength: { $size: { $ifNull: ['$qaList', []] } },
          vectorListLength: { $size: { $ifNull: ['$vectorList', []] } }
        }
      },
      {
        $group: {
          _id: null,
          totalQaListLength: { $sum: '$qaListLength' },
          totalVectorListLength: { $sum: '$vectorListLength' }
        }
      }
    ]);

    jsonRes(res, {
      data: {
        qaListLen: result[0]?.totalQaListLength || 0,
        vectorListLen: result[0]?.totalVectorListLength || 0
      }
    });

    if (init) {
      const list = await TrainingData.find(
        {
          userId,
          kbId
        },
        '_id'
      );
      list.forEach((item) => {
        generateQA(item._id);
        generateVector(item._id);
      });
    }
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
