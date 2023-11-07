import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { PgClient } from '@/service/pg';
import { withNextCors } from '@fastgpt/service/common/middle/cors';
import { getVectorsByText } from '@/service/core/ai/vector';
import { PgDatasetTableName } from '@fastgpt/global/core/dataset/constant';
import type { SearchTestProps } from '@/global/core/api/datasetReq.d';
import { connectToDatabase } from '@/service/mongo';
import type {
  SearchDataResponseItemType,
  SearchDataResultItemType
} from '@fastgpt/global/core/dataset/type';
import { getPgDataWithCollection } from '@/service/core/dataset/data/controller';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';
import { authTeamBalance } from '@/service/support/permission/auth/bill';
import { pushGenerateVectorBill } from '@/service/support/wallet/bill/push';

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { datasetId, text } = req.body as SearchTestProps;

    if (!datasetId || !text) {
      throw new Error('缺少参数');
    }

    // auth dataset role
    const { dataset, teamId, tmbId } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      datasetId,
      per: 'r'
    });

    // auth balance
    await authTeamBalance(teamId);

    const { vectors, tokenLen } = await getVectorsByText({
      model: dataset.vectorModel,
      input: [text]
    });

    const results: any = await PgClient.query(
      `BEGIN;
        SET LOCAL hnsw.ef_search = ${global.systemEnv.pgHNSWEfSearch || 100};
        select id, q, a, dataset_id, collection_id, (vector <#> '[${
          vectors[0]
        }]') * -1 AS score from ${PgDatasetTableName} where dataset_id='${datasetId}' ORDER BY vector <#> '[${
          vectors[0]
        }]' limit 12;
        COMMIT;`
    );

    const rows = results?.[2]?.rows as SearchDataResultItemType[];

    const collectionsData = await getPgDataWithCollection({ pgDataList: rows });

    // push bill
    pushGenerateVectorBill({
      teamId,
      tmbId,
      tokenLen: tokenLen,
      model: dataset.vectorModel
    });

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
