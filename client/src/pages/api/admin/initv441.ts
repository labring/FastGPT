import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { connectToDatabase } from '@/service/mongo';
import mongoose from 'mongoose';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    await authUser({ req, authRoot: true });

    const data = await mongoose.connection.db
      .collection('dataset.files')
      .updateMany({}, { $set: { 'metadata.datasetUsed': true } });

    jsonRes(res, {
      data
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
