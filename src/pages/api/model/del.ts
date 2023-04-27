import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { Chat, Model, connectToDatabase } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { PgClient } from '@/service/pg';
import { authModel } from '@/service/utils/auth';

/* 获取我的模型 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { modelId } = req.query as { modelId: string };
    const { authorization } = req.headers;

    if (!authorization) {
      throw new Error('无权操作');
    }

    if (!modelId) {
      throw new Error('参数错误');
    }

    // 凭证校验
    const userId = await authToken(authorization);

    await connectToDatabase();

    // 验证是否是该用户的 model
    await authModel({
      modelId,
      userId
    });

    // 删除 pg 中所有该模型的数据
    await PgClient.delete('modelData', {
      where: [['user_id', userId], 'AND', ['model_id', modelId]]
    });

    // 删除对应的聊天
    await Chat.deleteMany({
      modelId
    });

    // 删除模型
    await Model.deleteOne({
      _id: modelId,
      userId
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
