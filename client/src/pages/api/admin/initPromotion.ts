// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { connectToDatabase, TrainingData, User, promotionRecord } from '@/service/mongo';
import { PRICE_SCALE } from '@/constants/common';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await authUser({ req, authRoot: true });
    await connectToDatabase();

    // 计算剩余金额
    const countResidue: { userId: string; totalAmount: number }[] = await promotionRecord.aggregate(
      [
        {
          $group: {
            _id: '$userId', // Group by userId
            totalAmount: { $sum: '$amount' } // Calculate the sum of amount field
          }
        },
        {
          $project: {
            _id: false, // Exclude _id field
            userId: '$_id', // Include userId field
            totalAmount: true // Include totalAmount field
          }
        }
      ]
    );

    await Promise.all(
      countResidue.map((item) =>
        User.findByIdAndUpdate(item.userId, {
          $inc: { balance: item.totalAmount * PRICE_SCALE }
        })
      )
    );

    jsonRes(res, { data: countResidue });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
