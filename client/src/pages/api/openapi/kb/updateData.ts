import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { PgClient } from '@/service/pg';
import { withNextCors } from '@/service/utils/tools';
import { KB, connectToDatabase } from '@/service/mongo';
import { getVector } from '../plugin/vector';
import { PgTrainingTableName } from '@/constants/plugin';

export type Props = {
  dataId: string;
  kbId: string;
  a?: string;
  q?: string;
};

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { dataId, a = '', q = '', kbId } = req.body as Props;

    if (!dataId) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();

    // auth user and get kb
    const [{ userId }, kb] = await Promise.all([
      authUser({ req }),
      KB.findById(kbId, 'vectorModel')
    ]);

    if (!kb) {
      throw new Error("Can't find database");
    }

    // get vector
    const { vectors = [] } = await (async () => {
      if (q) {
        return getVector({
          userId,
          input: [q],
          model: kb.vectorModel
        });
      }
      return { vectors: [[]] };
    })();

    // 更新 pg 内容.仅修改a，不需要更新向量。
    await PgClient.update(PgTrainingTableName, {
      where: [['id', dataId], 'AND', ['user_id', userId]],
      values: [
        { key: 'source', value: '手动修改' },
        { key: 'a', value: a.replace(/'/g, '"') },
        ...(q
          ? [
              { key: 'q', value: q.replace(/'/g, '"') },
              { key: 'vector', value: `[${vectors[0]}]` }
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
