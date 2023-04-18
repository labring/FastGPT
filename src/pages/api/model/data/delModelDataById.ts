import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authToken } from '@/service/utils/tools';
import { connectPg } from '@/service/pg';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    let { dataId } = req.query as {
      dataId: string;
    };
    const { authorization } = req.headers;

    if (!authorization) {
      throw new Error('无权操作');
    }

    if (!dataId) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const userId = await authToken(authorization);

    const pg = await connectPg();
    await pg.query(`DELETE FROM modelData WHERE user_id = '${userId}' AND id = '${dataId}'`);

    jsonRes(res);
  } catch (err) {
    console.log(err);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
