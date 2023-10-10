import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { GridFSStorage } from '@/service/lib/gridfs';
import { datasetSpecialIdMap } from '@fastgpt/core/dataset/constant';
import { datasetSpecialIds } from '@fastgpt/core/dataset/constant';
import type { GSFileInfoType } from '@/types/common/file';
import { strIsLink } from '@fastgpt/common/tools/str';
import { PgClient } from '@/service/pg';
import { PgDatasetTableName } from '@/constants/plugin';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { fileId } = req.query as { kbId: string; fileId: string };
    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    // manual, mark
    if (datasetSpecialIds.includes(fileId)) {
      return jsonRes<GSFileInfoType>(res, {
        data: {
          id: fileId,
          size: 0,
          // @ts-ignore
          filename: datasetSpecialIdMap[fileId]?.name || fileId,
          uploadDate: new Date(),
          encoding: '',
          contentType: ''
        }
      });
    }
    // link file
    if (strIsLink(fileId)) {
      const { rows } = await PgClient.select(PgDatasetTableName, {
        where: [['user_id', userId], 'AND', ['file_id', fileId]],
        limit: 1,
        fields: ['source']
      });
      return jsonRes<GSFileInfoType>(res, {
        data: {
          id: fileId,
          size: 0,
          filename: rows[0]?.source || fileId,
          uploadDate: new Date(),
          encoding: '',
          contentType: ''
        }
      });
    }

    const gridFs = new GridFSStorage('dataset', userId);

    const file = await gridFs.findAndAuthFile(fileId);

    jsonRes<GSFileInfoType>(res, {
      data: file
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
