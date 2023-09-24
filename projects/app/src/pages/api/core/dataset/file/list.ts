import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, TrainingData } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { GridFSStorage } from '@/service/lib/gridfs';
import { PgClient } from '@/service/pg';
import { PgDatasetTableName } from '@/constants/plugin';
import { FileStatusEnum, OtherFileId } from '@/constants/dataset';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    let {
      pageNum = 1,
      pageSize = 10,
      kbId,
      searchText = ''
    } = req.body as { pageNum: number; pageSize: number; kbId: string; searchText: string };
    searchText = searchText?.replace(/'/g, '');

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    // find files
    const gridFs = new GridFSStorage('dataset', userId);
    const collection = gridFs.Collection();

    const mongoWhere = {
      ['metadata.kbId']: kbId,
      ['metadata.userId']: userId,
      ['metadata.datasetUsed']: true,
      ...(searchText && { filename: { $regex: searchText } })
    };
    const [files, total] = await Promise.all([
      collection
        .find(mongoWhere, {
          projection: {
            _id: 1,
            filename: 1,
            uploadDate: 1,
            length: 1
          }
        })
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize)
        .sort({ uploadDate: -1 })
        .toArray(),
      collection.countDocuments(mongoWhere)
    ]);

    async function GetOtherData() {
      return {
        id: OtherFileId,
        size: 0,
        filename: 'kb.Other Data',
        uploadTime: new Date(),
        status: (await TrainingData.findOne({ userId, kbId, file_id: '' }))
          ? FileStatusEnum.embedding
          : FileStatusEnum.ready,
        chunkLength: await PgClient.count(PgDatasetTableName, {
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
          chunkLength: await PgClient.count(PgDatasetTableName, {
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

    jsonRes(res, {
      data: {
        pageNum,
        pageSize,
        data: data.flat(),
        total
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
