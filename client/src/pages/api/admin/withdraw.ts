// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { connectToDatabase, TrainingData, User, promotionRecord } from '@/service/mongo';
import { TrainingModeEnum } from '@/constants/plugin';
import mongoose from 'mongoose';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await authUser({ req, authRoot: true });
    const { amount, userId, type } = req.body as {
      amount: number;
      userId: number;
      type: 'withdraw';
    };
    await connectToDatabase();

    if (!userId || !amount || type !== 'withdraw' || amount <= 0) {
      throw new Error('params is error');
    }

    // check promotion balance
    const countResidue: { totalAmount: number }[] = await promotionRecord.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
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

    const balance = countResidue[0].totalAmount;

    if (balance < amount) {
      throw new Error('可提现余额不足');
    }

    // add record
    await promotionRecord.create({
      userId,
      type,
      amount: -amount
    });

    jsonRes(res, {
      data: balance
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
