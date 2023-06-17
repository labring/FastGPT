// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { Model } from '@/service/models/model';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { name } = req.body as {
      name: string;
    };

    if (!name) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    // 上限校验
    const authCount = await Model.countDocuments({
      userId
    });
    if (authCount >= 30) {
      throw new Error('上限 30 个应用');
    }

    // 创建模型
    const response = await Model.create({
      name,
      userId
    });

    jsonRes(res, {
      data: response._id
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
