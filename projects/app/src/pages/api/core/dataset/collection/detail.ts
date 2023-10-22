/* 
    Get one dataset collection detail
*/
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@fastgpt/service/support/user/auth';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { id } = req.query as { id: string };

    if (!id) {
      throw new Error('Id is required');
    }

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    const collection = await MongoDatasetCollection.findOne({ _id: id, userId }).lean();

    if (!collection) {
      throw new Error('Collection not found');
    }

    jsonRes(res, {
      data: collection
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
