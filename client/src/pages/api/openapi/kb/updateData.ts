import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { PgClient } from '@/service/pg';
import { withNextCors } from '@/service/utils/tools';
import { openaiEmbedding } from '../plugin/openaiEmbedding';

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { dataId, a = '', q = '' } = req.body as { dataId: string; a?: string; q?: string };

    if (!dataId) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const { userId } = await authUser({ req });

    // get vector
    const vector = await (async () => {
      if (q) {
        return openaiEmbedding({
          userId,
          input: [q]
        });
      }
      return [];
    })();

    // 更新 pg 内容.仅修改a，不需要更新向量。
    await PgClient.update('modelData', {
      where: [['id', dataId], 'AND', ['user_id', userId]],
      values: [
        { key: 'source', value: '手动修改' },
        { key: 'a', value: a.replace(/'/g, '"') },
        ...(q
          ? [
              { key: 'q', value: q.replace(/'/g, '"') },
              { key: 'vector', value: `[${vector[0]}]` }
            ]
          : [])
      ]
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});
