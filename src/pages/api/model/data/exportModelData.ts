import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authToken } from '@/service/utils/auth';
import { PgClient } from '@/service/pg';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    let { modelId } = req.query as {
      modelId: string;
    };

    const { authorization } = req.headers;

    if (!authorization) {
      throw new Error('无权操作');
    }

    if (!modelId) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const userId = await authToken(authorization);

    await connectToDatabase();

    // 统计数据
    const count = await PgClient.count('modelData', {
      where: [['model_id', modelId], 'AND', ['user_id', userId]]
    });
    // 从 pg 中获取所有数据
    const pgData = await PgClient.select<{ q: string; a: string }>('modelData', {
      where: [['model_id', modelId], 'AND', ['user_id', userId]],
      fields: ['q', 'a'],
      order: [{ field: 'id', mode: 'DESC' }],
      limit: count
    });

    const data: [string, string][] = pgData.rows.map((item) => [
      item.q.replace(/\n/g, '\\n'),
      item.a.replace(/\n/g, '\\n')
    ]);

    jsonRes(res, {
      data
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
