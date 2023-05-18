import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authToken } from '@/service/utils/auth';
import { ModelDataStatusEnum } from '@/constants/model';
import { generateVector } from '@/service/events/generateVector';
import { PgClient } from '@/service/pg';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { dataId, a, q } = req.body as { dataId: string; a: string; q?: string };

    if (!dataId) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const userId = await authToken(req);

    // 更新 pg 内容.仅修改a，不需要更新向量。
    await PgClient.update('modelData', {
      where: [['id', dataId], 'AND', ['user_id', userId]],
      values: [
        { key: 'a', value: a },
        ...(q
          ? [
              { key: 'q', value: q },
              { key: 'status', value: ModelDataStatusEnum.waiting }
            ]
          : [])
      ]
    });

    q && generateVector();

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
