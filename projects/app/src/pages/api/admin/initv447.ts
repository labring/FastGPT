import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { connectToDatabase } from '@/service/mongo';
import { PgClient } from '@/service/pg';
import { PgDatasetTableName } from '@/constants/plugin';
import { DatasetFileIdEnum } from '@fastgpt/core/dataset/constant';
import mongoose, { Types } from 'mongoose';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    await authUser({ req, authRoot: true });
    // 去重获取 fileId
    const { rows } = await PgClient.query(`SELECT DISTINCT file_id
    FROM ${PgDatasetTableName};
    `);

    const collection = mongoose.connection.db.collection(`dataset.files`);

    /* 遍历所有的 fileId，去找有没有对应的文件，没有的话则改成manual */
    const updateResult = await Promise.allSettled(
      rows.map(async (item) => {
        // 找下是否有对应的文件
        const file = await collection.findOne({
          _id: new Types.ObjectId(item.file_id)
        });
        if (file) return '';
        // 没有文件的，改成manual
        await PgClient.query(`UPDATE ${PgDatasetTableName}
    SET file_id = '${DatasetFileIdEnum.manual}'
    WHERE file_id = '${item.file_id}';
    `);
        return item.file_id;
      })
    );

    // 更新所有 file_id 为空或不存在的 data
    const { rowCount } = await PgClient.query(`UPDATE ${PgDatasetTableName}
    SET file_id = '${DatasetFileIdEnum.manual}'
    WHERE file_id IS NULL OR file_id = '';
    `);

    jsonRes(res, {
      data: {
        empty: rowCount,
        // @ts-ignore
        fileNoExist: updateResult.filter((item) => item?.value).length
      }
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
