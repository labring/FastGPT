import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { PgClient } from '@/service/pg';
import { withNextCors } from '@/service/utils/tools';
import { openaiEmbedding } from '../plugin/openaiEmbedding';
import type { KbTestItemType } from '@/types/plugin';

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
    const { userId } = await authUser({ req });

    if (!userId) {
      throw new Error('缺少用户ID');
    }

    const vector = await openaiEmbedding({
      userId,
      input: [text]
    });

    const response: any = await PgClient.query(
      `BEGIN;
        SET LOCAL ivfflat.probes = ${global.systemEnv.pgIvfflatProbe || 10};
        select id,q,a,source,(vector <#> '[${
          vector[0]
        }]') * -1 AS score from modelData where kb_id='${kbId}' AND user_id='${userId}' order by vector <#> '[${
        vector[0]
      }]' limit 12;
        COMMIT;`
    );

    jsonRes<Response>(res, { data: response?.[2]?.rows || [] });
  } catch (err) {
    console.log(err);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});
