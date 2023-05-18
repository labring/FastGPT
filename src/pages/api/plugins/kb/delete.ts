import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, KB } from '@/service/mongo';
import { authToken } from '@/service/utils/auth';
import { PgClient } from '@/service/pg';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { id } = req.query as {
      id: string;
    };

    if (!id) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const userId = await authToken(req);

    await connectToDatabase();

    // delete mongo data
    await KB.findOneAndDelete({
      _id: id,
      userId
    });

    // delete all pg data
    // 删除 pg 中所有该模型的数据
    await PgClient.delete('modelData', {
      where: [['user_id', userId], 'AND', ['kb_id', id]]
    });

    // delete related model

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
