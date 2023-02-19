import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Model, Chat } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { ModelType } from '@/types/model';

/* 获取我的模型 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { modelId } = req.query;
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

    // 获取模型配置
    const model: ModelType | null = await Model.findOne({
      _id: modelId,
      userId
    });

    if (!model) {
      throw new Error('模型不存在');
    }

    // 创建 chat 数据
    const response = await Chat.create({
      userId,
      modelId,
      expiredTime: Date.now() + model.security.expiredTime,
      loadAmount: model.security.maxLoadAmount
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
