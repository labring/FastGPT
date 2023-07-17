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

    jsonRes(res, {
      data: ''
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
