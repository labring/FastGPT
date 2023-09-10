import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { GridFSStorage } from '@/service/lib/gridfs';
import { PgClient } from '@/service/pg';
import { PgTrainingTableName } from '@/constants/plugin';
import { Types } from 'mongoose';
import { OtherFileId } from '@/constants/kb';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { fileId, kbId } = req.query as { fileId: string; kbId: string };

    if (!fileId || !kbId) {
      throw new Error('fileId and kbId is required');
    }

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    if (fileId === OtherFileId) {
      await PgClient.delete(PgTrainingTableName, {
        where: [
          ['user_id', userId],
          'AND',
          ['kb_id', kbId],
          "AND (file_id IS NULL OR file_id = '')"
        ]
      });
    } else {
      const gridFs = new GridFSStorage('dataset', userId);
      const bucket = gridFs.GridFSBucket();

      await gridFs.findAndAuthFile(fileId);

      // delete all pg data
      await PgClient.delete(PgTrainingTableName, {
        where: [['user_id', userId], 'AND', ['kb_id', kbId], 'AND', ['file_id', fileId]]
      });

      //   delete file
      await bucket.delete(new Types.ObjectId(fileId));
    }

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
