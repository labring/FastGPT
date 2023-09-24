import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { connectToDatabase, Bill } from '@/service/mongo';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    await authUser({ req, authRoot: true });

    try {
      await Bill.collection.dropIndex('time_1');
    } catch (error) {}
    try {
      await Bill.collection.createIndex({ time: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
    } catch (error) {}

    jsonRes(res, {
      data: {}
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
