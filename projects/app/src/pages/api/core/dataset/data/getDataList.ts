import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { PgClient } from '@fastgpt/service/common/pg';
import { PgDatasetTableName } from '@fastgpt/global/core/dataset/constant';
import type { DatasetDataListItemType } from '@/global/core/dataset/response.d';
import type { GetDatasetDataListProps } from '@/global/core/api/datasetReq';
import { authDatasetCollection } from '@fastgpt/service/support/permission/auth/dataset';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    let {
      pageNum = 1,
      pageSize = 10,
      searchText = '',
      collectionId
    } = req.body as GetDatasetDataListProps;

    // 凭证校验
    await authDatasetCollection({ req, authToken: true, collectionId, per: 'r' });

    searchText = searchText.replace(/'/g, '');

    const where: any = [
      ['collection_id', collectionId],
      searchText ? `AND (q ILIKE '%${searchText}%' OR a ILIKE '%${searchText}%')` : ''
    ];

    const [searchRes, total] = await Promise.all([
      PgClient.select<DatasetDataListItemType>(PgDatasetTableName, {
        fields: ['id', 'q', 'a'],
        where,
        order: [{ field: 'id', mode: 'DESC' }],
        limit: pageSize,
        offset: pageSize * (pageNum - 1)
      }),
      PgClient.count(PgDatasetTableName, {
        fields: ['id'],
        where
      })
    ]);

    jsonRes(res, {
      data: {
        pageNum,
        pageSize,
        data: searchRes.rows,
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
