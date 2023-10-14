import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@fastgpt/support/user/auth';
import { PgClient } from '@/service/pg';
import { withNextCors } from '@/service/utils/tools';
import { getVector } from '../../openapi/plugin/vector';
import { PgDatasetTableName } from '@/constants/plugin';
import { MongoDataset } from '@fastgpt/core/dataset/schema';
import type { SearchTestProps } from '@/global/core/api/datasetReq.d';
import type { SearchTestResponseType } from '@/global/core/api/datasetRes.d';
import { connectToDatabase } from '@/service/mongo';

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { kbId, text } = req.body as SearchTestProps;

    if (!kbId || !text) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const [{ userId }, kb] = await Promise.all([
      authUser({ req, authToken: true, authApiKey: true }),
      MongoDataset.findById(kbId, 'vectorModel')
    ]);

    if (!userId || !kb) {
      throw new Error('缺少用户ID');
    }

    const { vectors } = await getVector({
      model: kb.vectorModel,
      userId,
      input: [text]
    });

    const response: any = await PgClient.query(
      `BEGIN;
        SET LOCAL hnsw.ef_search= ${global.systemEnv.pgHNSWEfSearch || 40};
        select id, q, a, source, file_id, (vector <#> '[${
          vectors[0]
        }]') * -1 AS score from ${PgDatasetTableName} where kb_id='${kbId}' AND user_id='${userId}' order by vector <#> '[${
          vectors[0]
        }]' limit 12;
        COMMIT;`
    );

    jsonRes<SearchTestResponseType>(res, {
      data: response?.[2]?.rows || []
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});
