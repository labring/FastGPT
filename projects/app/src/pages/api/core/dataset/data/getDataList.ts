import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@fastgpt/service/support/user/auth';
import { PgClient } from '@/service/pg';
import { PgDatasetTableName } from '@/constants/plugin';
import type { DatasetDataListItemType } from '@/global/core/dataset/response.d';
import type { GetDatasetDataListProps } from '@/global/core/api/datasetReq';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    let {
      pageNum = 1,
      pageSize = 10,
      searchText = '',
      collectionId
    } = req.body as GetDatasetDataListProps;
    if (!collectionId) {
      throw new Error('collectionId is required');
    }

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    searchText = searchText.replace(/'/g, '');

    const where: any = [
      ['user_id', userId],
      'AND',
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
