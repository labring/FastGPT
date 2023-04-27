import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { PgClient } from '@/service/pg';
import type { PgModelDataItemType } from '@/types/pg';
import { authModel } from '@/service/utils/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    let {
      modelId,
      pageNum = 1,
      pageSize = 10,
      searchText = ''
    } = req.query as {
      modelId: string;
      pageNum: string;
      pageSize: string;
      searchText: string;
    };
    const { authorization } = req.headers;

    pageNum = +pageNum;
    pageSize = +pageSize;

    if (!authorization) {
      throw new Error('无权操作');
    }

    if (!modelId) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const userId = await authToken(authorization);

    await connectToDatabase();

    const { model } = await authModel({
      userId,
      modelId,
      authOwner: false
    });

    const where: any = [
      ...(model.share.isShareDetail ? [] : [['user_id', userId], 'AND']),
      ['model_id', modelId],
      ...(searchText ? ['AND', `(q LIKE '%${searchText}%' OR a LIKE '%${searchText}%')`] : [])
    ];

    const searchRes = await PgClient.select<PgModelDataItemType>('modelData', {
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
