import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { startQueue } from '@/service/utils/tools';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { userId } = await authCert({ req, authToken: true });
    await unlockTask(userId);
  } catch (error) {}
  jsonRes(res);
}

async function unlockTask(userId: string) {
  try {
    await MongoDatasetTraining.updateMany(
      {
        userId
      },
      {
        lockTime: new Date('2000/1/1')
      }
    );

    startQueue();
  } catch (error) {
    unlockTask(userId);
  }
}
