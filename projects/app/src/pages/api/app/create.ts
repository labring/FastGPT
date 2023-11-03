// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@fastgpt/service/support/user/auth';
import type { CreateAppParams } from '@/types/app';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const {
      name = 'APP',
      avatar,
      type = AppTypeEnum.advanced,
      modules
    } = req.body as CreateAppParams;

    if (!name || !Array.isArray(modules)) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    // 上限校验
    const authCount = await MongoApp.countDocuments({
      userId
    });
    if (authCount >= 50) {
      throw new Error('上限 50 个应用');
    }

    // 创建模型
    const response = await MongoApp.create({
      avatar,
      name,
      userId,
      modules,
      type
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
