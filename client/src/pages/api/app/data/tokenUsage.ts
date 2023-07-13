import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Bill } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import type { ChatHistoryItemType } from '@/types/chat';
import { Types } from 'mongoose';

/* get one app chat history content number. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { appId, start, end } = req.body as { appId: string; start: Date; end: Date };
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    const result = await Bill.aggregate([
      {
        $match: {
          appId: new Types.ObjectId(appId),
          userId: new Types.ObjectId(userId),
          time: { $gte: new Date(start) }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$time' },
            month: { $month: '$time' },
            day: { $dayOfMonth: '$time' }
          },
          tokenLen: { $sum: '$tokenLen' } // 对tokenLen的值求和
        }
      },
      {
        $project: {
          _id: 0,
          date: { $dateFromParts: { year: '$_id.year', month: '$_id.month', day: '$_id.day' } },
          tokenLen: 1
        }
      },
      { $sort: { date: 1 } }
    ]);

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
