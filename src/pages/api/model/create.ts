// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { ModelStatusEnum, modelList, ChatModelNameEnum, ChatModelNameMap } from '@/constants/model';
import { Model } from '@/service/models/model';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { name, serviceModelName } = req.body as {
      name: string;
      serviceModelName: `${ChatModelNameEnum}`;
    };
    const { authorization } = req.headers;

    if (!authorization) {
      throw new Error('无权操作');
    }

    if (!name || !serviceModelName) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const userId = await authToken(authorization);

    const modelItem = modelList.find((item) => item.model === serviceModelName);

    if (!modelItem) {
      throw new Error('模型不存在');
    }

    await connectToDatabase();

    // 上限校验
    const authCount = await Model.countDocuments({
      userId
    });
    if (authCount >= 20) {
      throw new Error('上限 20 个模型');
    }

    // 创建模型
    const response = await Model.create({
      name,
      userId,
      status: ModelStatusEnum.running,
      service: {
        trainId: '',
        chatModel: ChatModelNameMap[modelItem.model], // 聊天时用的模型
        modelName: modelItem.model // 最底层的模型，不会变，用于计费等核心操作
      }
    });

    // 根据 id 获取模型信息
    const model = await Model.findById(response._id);

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
