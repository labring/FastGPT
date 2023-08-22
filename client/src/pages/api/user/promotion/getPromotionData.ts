// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, User, promotionRecord } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import mongoose from 'mongoose';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { userId } = await authUser({ req, authToken: true });

    const invitedAmount = await User.countDocuments({
      inviterId: userId
    });

    // 计算累计合
    const countHistory: { totalAmount: number }[] = await promotionRecord.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          amount: { $gt: 0 }
        }
      },
      {
        $group: {
          _id: null, // 分组条件，这里使用 null 表示不分组
          totalAmount: { $sum: '$amount' } // 计算 amount 字段的总和
        }
      },
      {
        $project: {
          _id: false, // 排除 _id 字段
          totalAmount: true // 只返回 totalAmount 字段
        }
      }
    ]);

    jsonRes(res, {
      data: {
        invitedAmount,
        earningsAmount: countHistory[0]?.totalAmount || 0
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
