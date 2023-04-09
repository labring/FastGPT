import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Model, Chat } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import type { ModelSchema } from '@/types/mongoSchema';

/* 获取我的模型 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { modelId } = req.query as {
      modelId: string;
    };
    const { authorization } = req.headers;

    if (!authorization) {
      throw new Error('无权生成对话');
    }

    if (!modelId) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const userId = await authToken(authorization);

    await connectToDatabase();

    // 校验是否为用户的模型
    const model = await Model.findOne<ModelSchema>({
      _id: modelId,
      userId
    });

    if (!model) {
      throw new Error('无权使用该模型');
    }

    // 创建 chat 数据
    const response = await Chat.create({
      userId,
      modelId,
      content: []
    });

    jsonRes(res, {
      data: response._id // 即聊天框的 ID
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
