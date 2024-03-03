import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { startTrainingQueue } from '@/service/core/dataset/training/utils';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    await authCert({ req, authToken: true });
    startTrainingQueue();
  } catch (error) {}
  jsonRes(res);
}
