import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, TrainingData } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { GridFSStorage } from '@/service/lib/gridfs';
import { PgClient } from '@/service/pg';
import { PgTrainingTableName } from '@/constants/plugin';
import { KbFileItemType } from '@/types/plugin';
import { FileStatusEnum, OtherFileId } from '@/constants/kb';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    let { kbId, searchText } = req.query as { kbId: string; searchText: string };
    searchText = searchText.replace(/'/g, '');

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    const gridFs = new GridFSStorage('dataset', userId);
    const bucket = gridFs.GridFSBucket();

    const files = await bucket
      .find({ ['metadata.kbId']: kbId, ...(searchText && { filename: { $regex: searchText } }) })
      .sort({ _id: -1 })
      .toArray();

    async function GetOtherData() {
      return {
        id: OtherFileId,
        size: 0,
        filename: 'kb.Other Data',
        uploadTime: new Date(),
        status: (await TrainingData.findOne({ userId, kbId, file_id: '' }))
          ? FileStatusEnum.embedding
          : FileStatusEnum.ready,
        chunkLength: await PgClient.count(PgTrainingTableName, {
          fields: ['id'],
          where: [
            ['user_id', userId],
            'AND',
            ['kb_id', kbId],
            "AND (file_id IS NULL OR file_id = '')"
          ]
        })
      };
    }

    const data = await Promise.all([
      GetOtherData(),
      ...files.map(async (file) => {
        return {
          id: String(file._id),
          size: file.length,
          filename: file.filename,
          uploadTime: file.uploadDate,
          status: (await TrainingData.findOne({ userId, kbId, file_id: file._id }))
            ? FileStatusEnum.embedding
            : FileStatusEnum.ready,
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
    ]);

    jsonRes<KbFileItemType[]>(res, {
      data: data.flat().filter((item) => item.chunkLength > 0)
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
