import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { Model } from '@/service/models/model';
import type { ModelUpdateParams } from '@/types/model';

/* 获取我的模型 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { name, service, security, systemPrompt, intro, temperature } =
      req.body as ModelUpdateParams;
    const { modelId } = req.query as { modelId: string };
    const { authorization } = req.headers;

    if (!authorization) {
      throw new Error('无权操作');
    }

    if (!name || !service || !security || !modelId) {
      throw new Error('参数错误');
    }

    // 凭证校验
    const userId = await authToken(authorization);

    await connectToDatabase();

    // 更新模型
    await Model.updateOne(
      {
        _id: modelId,
        userId
      },
      {
        name,
        systemPrompt,
        intro,
        temperature,
        // service,
        security
      }
    );

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
