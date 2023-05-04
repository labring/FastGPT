import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authToken } from '@/service/utils/auth';
import { PgClient } from '@/service/pg';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    let { dataId } = req.query as {
      dataId: string;
    };

    if (!dataId) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const userId = await authToken(req);

    await PgClient.delete('modelData', {
      where: [['user_id', userId], 'AND', ['id', dataId]]
    });

    jsonRes(res);
  } catch (err) {
    console.log(err);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
