import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, TrainingData } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { GridFSStorage } from '@/service/lib/gridfs';
import { PgClient } from '@/service/pg';
import { PgDatasetTableName } from '@/constants/plugin';
import { Types } from 'mongoose';
import { OtherFileId } from '@/constants/dataset';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { fileId, kbId } = req.query as { fileId: string; kbId: string };

    if (!fileId || !kbId) {
      throw new Error('fileId and kbId is required');
    }

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    // other data. Delete only vector data
    if (fileId === OtherFileId) {
      await PgClient.delete(PgDatasetTableName, {
        where: [
          ['user_id', userId],
          'AND',
          ['kb_id', kbId],
          "AND (file_id IS NULL OR file_id = '')"
        ]
      });
    } else {
      // auth file
      const gridFs = new GridFSStorage('dataset', userId);
      const bucket = gridFs.GridFSBucket();

      await gridFs.findAndAuthFile(fileId);

      // delete all pg data
      await PgClient.delete(PgDatasetTableName, {
        where: [['user_id', userId], 'AND', ['kb_id', kbId], 'AND', ['file_id', fileId]]
      });
      // delete all training data
      await TrainingData.deleteMany({
        userId,
        file_id: fileId
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
