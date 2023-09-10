import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { GridFSStorage } from '@/service/lib/gridfs';
import { PgClient } from '@/service/pg';
import { PgTrainingTableName } from '@/constants/plugin';
import { Types } from 'mongoose';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { kbId } = req.query as { kbId: string };
    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    const gridFs = new GridFSStorage('dataset', userId);
    const bucket = gridFs.GridFSBucket();

    const files = await bucket
      // 1 hours expired
      .find({
        uploadDate: { $lte: new Date(Date.now() - 60 * 1000) },
        ['metadata.kbId']: kbId,
        ['metadata.userId']: userId
      })
      .sort({ _id: -1 })
      .toArray();

    const data = await Promise.all(
      files.map(async (file) => {
        return {
          id: file._id,
          chunkLength: await PgClient.count(PgTrainingTableName, {
            fields: ['id'],
            where: [
              ['user_id', userId],
              'AND',
              ['kb_id', kbId],
              'AND',
              ['file_id', String(file._id)]
            ]
          })
        };
      })
    );

    await Promise.all(
      data
        .filter((item) => item.chunkLength === 0)
        .map((file) => bucket.delete(new Types.ObjectId(file.id)))
    );

    jsonRes(res);
  } catch (err) {
    jsonRes(res);
  }
}
