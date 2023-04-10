import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { connectRedis } from '@/service/redis';
import { VecModelDataIdx } from '@/constants/redis';
import { clearStrLineBreak } from '@/utils/tools';

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
    const redis = await connectRedis();

    // 从 redis 中获取数据
    const searchRes = await redis.ft.search(
      VecModelDataIdx,
      `@modelId:{${modelId}} @userId:{${userId}}`,
      {
        RETURN: ['q', 'text'],
        LIMIT: {
          from: 0,
          size: 10000
        }
      }
    );

    let str = `question,answer\n`;

    searchRes.documents.forEach((item: any) => {
      if (item.value.q && item.value.text) {
        str += `"${clearStrLineBreak(item.value.q)}","${clearStrLineBreak(item.value.text)}"\n`;
      }
    });

    jsonRes(res, {
      data: str.slice(0, str.length - 1)
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
