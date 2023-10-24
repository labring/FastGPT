import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@fastgpt/service/support/user/auth';
import { PgClient } from '@/service/pg';
import { withNextCors } from '@fastgpt/service/common/middle/cors';
import { getVector } from '../../openapi/plugin/vector';
import { PgDatasetTableName } from '@/constants/plugin';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import type { SearchTestProps } from '@/global/core/api/datasetReq.d';
import { connectToDatabase } from '@/service/mongo';
import type {
  SearchDataResponseItemType,
  SearchDataResultItemType
} from '@fastgpt/global/core/dataset/type';
import { getDatasetDataItemInfo } from './data/getDataById';

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { datasetId, text } = req.body as SearchTestProps;

    if (!datasetId || !text) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const [{ userId }, dataset] = await Promise.all([
      authUser({ req, authToken: true, authApiKey: true }),
      MongoDataset.findById(datasetId, 'vectorModel')
    ]);

    if (!userId || !dataset) {
      throw new Error('缺少用户ID');
    }

    const { vectors } = await getVector({
      model: dataset.vectorModel,
      userId,
      input: [text]
    });

    const results: any = await PgClient.query(
      `BEGIN;
        SET LOCAL hnsw.ef_search = ${global.systemEnv.pgHNSWEfSearch || 100};
        select id, q, a, dataset_id, collection_id, (vector <#> '[${
          vectors[0]
        }]') * -1 AS score from ${PgDatasetTableName} where dataset_id='${datasetId}' AND user_id='${userId}' ORDER BY vector <#> '[${
          vectors[0]
        }]' limit 12;
        COMMIT;`
    );

    const rows = results?.[2]?.rows as SearchDataResultItemType[];

    const collectionsData = await getDatasetDataItemInfo({ pgDataList: rows });

    jsonRes<SearchDataResponseItemType[]>(res, {
      data: collectionsData.map((item, index) => ({
        ...item,
        score: rows[index].score
      }))
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});
