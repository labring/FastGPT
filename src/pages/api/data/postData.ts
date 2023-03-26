import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Data } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import type { DataType } from '@/types/data';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    let { name, type } = req.body as { name: string; type: DataType };
    if (!name || !type) {
      throw new Error('参数错误');
    }
    await connectToDatabase();

    const { authorization } = req.headers;

    const userId = await authToken(authorization);

    // 生成 data 集合
    const data = await Data.create({
      userId,
      name,
      type
    });

    jsonRes(res, {
      data: data._id
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
