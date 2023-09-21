import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { PgClient } from '@/service/pg';
import { PgDatasetTableName } from '@/constants/plugin';
import type { PgDataItemType } from '@/types/core/dataset/data';

export type Response = {
  id: string;
  q: string;
  a: string;
  source: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    let { dataId } = req.query as {
      dataId: string;
    };
    if (!dataId) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    const where: any = [['user_id', userId], 'AND', ['id', dataId]];

    const searchRes = await PgClient.select<PgDataItemType>(PgDatasetTableName, {
      fields: ['kb_id', 'id', 'q', 'a', 'source', 'file_id'],
      where,
      limit: 1
    });

    jsonRes(res, {
      data: searchRes.rows[0]
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
