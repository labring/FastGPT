import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { PgClient } from '@/service/pg';
import { withNextCors } from '@/service/utils/tools';
import { getVector } from '../plugin/vector';
import type { KbTestItemType } from '@/types/plugin';
import { PgDatasetTableName } from '@/constants/plugin';
import { KB } from '@/service/mongo';

export type Props = {
  kbId: string;
  text: string;
};
export type Response = KbTestItemType['results'];

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { kbId, text } = req.body as Props;

    if (!kbId || !text) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const [{ userId }, kb] = await Promise.all([
      authUser({ req }),
      KB.findById(kbId, 'vectorModel')
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
        SET LOCAL ivfflat.probes = ${global.systemEnv.pgIvfflatProbe || 10};
        select id, q, a, source, file_id, (vector <#> '[${
          vectors[0]
        }]') * -1 AS score from ${PgDatasetTableName} where kb_id='${kbId}' AND user_id='${userId}' order by vector <#> '[${
        vectors[0]
      }]' limit 12;
        COMMIT;`
    );

    jsonRes<Response>(res, {
      data: response?.[2]?.rows || []
    });
  } catch (err) {
    console.log(err);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});
