import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authToken } from '@/service/utils/auth';
import { PgClient } from '@/service/pg';
import type { PgKBDataItemType } from '@/types/pg';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    let {
      kbId,
      pageNum = 1,
      pageSize = 10,
      searchText = ''
    } = req.body as {
      kbId: string;
      pageNum: number;
      pageSize: number;
      searchText: string;
    };
    if (!kbId) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const userId = await authToken(req);

    await connectToDatabase();

    const where: any = [
      ['user_id', userId],
      'AND',
      ['kb_id', kbId],
      ...(searchText ? ['AND', `(q LIKE '%${searchText}%' OR a LIKE '%${searchText}%')`] : [])
    ];

    const searchRes = await PgClient.select<PgKBDataItemType>('modelData', {
      fields: ['id', 'q', 'a', 'status'],
      where,
      order: [{ field: 'id', mode: 'DESC' }],
      limit: pageSize,
      offset: pageSize * (pageNum - 1)
    });

    jsonRes(res, {
      data: {
        pageNum,
        pageSize,
        data: searchRes.rows,
        total: await PgClient.count('modelData', {
          where
        })
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
