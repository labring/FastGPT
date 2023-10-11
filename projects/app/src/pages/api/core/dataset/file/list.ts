import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, TrainingData } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { GridFSStorage } from '@/service/lib/gridfs';
import { PgClient, updateDataFileId } from '@/service/pg';
import { PgDatasetTableName } from '@/constants/plugin';
import { FileStatusEnum } from '@/constants/dataset';
import { strIsLink } from '@fastgpt/common/tools/str';
import {
  DatasetSpecialIdEnum,
  datasetSpecialIdMap,
  datasetSpecialIds
} from '@fastgpt/core/dataset/constant';
import { Types } from 'mongoose';

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

    // select and count same file_id data, exclude special id
    const pgWhere = `user_id = '${userId}' AND kb_id = '${kbId}' ${datasetSpecialIds
      .map((item) => `AND file_id!='${item}'`)
      .join(' ')}
      ${searchText ? `AND source ILIKE '%${searchText}%'` : ''}`;

    let [{ rows }, { rowCount: total }] = await Promise.all([
      PgClient.query<{ file_id: string; count: number }>(`SELECT file_id, COUNT(*) AS count
    FROM ${PgDatasetTableName}
    where ${pgWhere}
    GROUP BY file_id
    ORDER BY file_id DESC
    LIMIT ${pageSize} OFFSET ${(pageNum - 1) * pageSize};
    `),
      PgClient.query(`SELECT DISTINCT file_id
    FROM ${PgDatasetTableName}
    where ${pgWhere}
    `)
    ]);

    // If fileId is invalid, reset it to manual
    await Promise.all(
      rows.map((row) => {
        if (!strIsLink(row.file_id) && row.file_id.length !== 24) {
          return updateDataFileId({
            oldFileId: row.file_id,
            userId,
            newFileId: DatasetSpecialIdEnum.manual
          });
        }
      })
    );
    // just filter link or fileData
    rows = rows.filter((row) => strIsLink(row.file_id) || row.file_id.length === 24);

    // find files
    const gridFs = new GridFSStorage('dataset', userId);
    const collection = gridFs.Collection();

    async function getSpecialData() {
      if (pageNum !== 1) return [];
      return [
        {
          id: DatasetSpecialIdEnum.manual,
          size: 0,
          filename: datasetSpecialIdMap[DatasetSpecialIdEnum.manual].name,
          uploadTime: new Date(),
          status: FileStatusEnum.ready,
          chunkLength: await PgClient.count(PgDatasetTableName, {
            fields: ['id'],
            where: [
              ['user_id', userId],
              'AND',
              ['file_id', DatasetSpecialIdEnum.manual],
              'AND',
              ['kb_id', kbId]
            ]
          })
        },
        {
          id: DatasetSpecialIdEnum.mark,
          size: 0,
          filename: datasetSpecialIdMap[DatasetSpecialIdEnum.mark].name,
          uploadTime: new Date(),
          status: FileStatusEnum.ready,
          chunkLength: await PgClient.count(PgDatasetTableName, {
            fields: ['id'],
            where: [
              ['user_id', userId],
              'AND',
              ['file_id', DatasetSpecialIdEnum.mark],
              'AND',
              ['kb_id', kbId]
            ]
          })
        }
      ];
    }

    const data = await Promise.all([
      getSpecialData(),
      ...rows.map(async (row) => {
        if (!row.file_id) return null;
        // link data
        if (strIsLink(row.file_id)) {
          const { rows } = await PgClient.select(PgDatasetTableName, {
            where: [['user_id', userId], 'AND', ['file_id', row.file_id]],
            limit: 1,
            fields: ['source']
          });
          return {
            id: row.file_id,
            size: 0,
            filename: rows[0]?.source || row.file_id,
            uploadTime: new Date(),
            status: FileStatusEnum.ready,
            chunkLength: row.count
          };
        }
        // file data
        const file = await collection.findOne(
          {
            _id: new Types.ObjectId(row.file_id),
            ['metadata.userId']: userId,
            ['metadata.kbId']: kbId
          },
          {
            projection: {
              _id: 1,
              filename: 1,
              uploadDate: 1,
              length: 1
            }
          }
        );
        if (!file) return null;
        return {
          id: String(file._id),
          size: file.length,
          filename: file.filename,
          uploadTime: file.uploadDate,
          status: (await TrainingData.findOne({ userId, kbId, file_id: file._id }))
            ? FileStatusEnum.embedding
            : FileStatusEnum.ready,
          chunkLength: row.count
        };
      })
    ]);

    jsonRes(res, {
      data: {
        pageNum,
        pageSize,
        data: data.flat().filter((item) => item),
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
