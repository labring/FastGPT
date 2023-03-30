import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, ModelData, Model } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { ModelDataSchema } from '@/types/mongoSchema';
import { generateVector } from '@/service/events/generateVector';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { modelId, data } = req.body as {
      modelId: string;
      data: { text: ModelDataSchema['text']; q: ModelDataSchema['q'] }[];
    };
    const { authorization } = req.headers;

    if (!authorization) {
      throw new Error('无权操作');
    }

    if (!modelId || !Array.isArray(data)) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const userId = await authToken(authorization);

    await connectToDatabase();

    // 验证是否是该用户的 model
    const model = await Model.findOne({
      _id: modelId,
      userId
    });

    if (!model) {
      throw new Error('无权操作该模型');
    }

    // push data
    await ModelData.insertMany(
      data.map((item) => ({
        ...item,
        modelId,
        userId
      }))
    );

    generateVector(true);

    jsonRes(res, {
      data: model
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
