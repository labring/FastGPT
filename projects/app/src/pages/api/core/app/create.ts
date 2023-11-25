// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { CreateAppParams } from '@fastgpt/global/core/app/api.d';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { authUserNotVisitor } from '@fastgpt/service/support/permission/auth/user';
import { SimpleModeTemplate_FastGPT_Universal } from '@/global/core/app/constants';

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
    const { teamId, tmbId } = await authUserNotVisitor({ req, authToken: true });

    // 上限校验
    const authCount = await MongoApp.countDocuments({
      teamId
    });
    if (authCount >= 50) {
      throw new Error('每个团队上限 50 个应用');
    }

    // 创建模型
    const response = await MongoApp.create({
      avatar,
      name,
      teamId,
      tmbId,
      modules,
      type,
      simpleTemplateId: SimpleModeTemplate_FastGPT_Universal.id
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
