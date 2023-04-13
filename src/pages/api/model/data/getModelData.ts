import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { connectRedis } from '@/service/redis';
import { VecModelDataIdx } from '@/constants/redis';

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
    const redis = await connectRedis();

    // 从 redis 中获取数据
    const searchRes = await redis.ft.search(
      VecModelDataIdx,
      `@modelId:{${modelId}} @userId:{${userId}} ${searchText ? `*${searchText}*` : ''}`,
      {
        RETURN: ['q', 'text', 'status'],
        LIMIT: {
          from: (pageNum - 1) * pageSize,
          size: pageSize
        },
        SORTBY: {
          BY: 'modelId',
          DIRECTION: 'DESC'
        }
      }
    );

    jsonRes(res, {
      data: {
        pageNum,
        pageSize,
        data: searchRes.documents.map((item) => ({
          id: item.id,
          ...item.value
        })),
        total: searchRes.total
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
