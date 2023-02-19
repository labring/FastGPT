// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { ModelStatusEnum, OpenAiList } from '@/constants/model';
import { Model } from '@/service/models/model';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { name, serviceModelName, serviceModelCompany = 'openai' } = req.body;
    const { authorization } = req.headers;

    if (!authorization) {
      throw new Error('无权操作');
    }

    if (!name || !serviceModelName || !serviceModelCompany) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const userId = await authToken(authorization);

    const modelItem = OpenAiList.find((item) => item.model === serviceModelName);

    if (!modelItem) {
      throw new Error('模型错误');
    }

    await connectToDatabase();

    // 重名校验
    const authRepeatName = await Model.findOne({
      name,
      userId
    });
    if (authRepeatName) {
      throw new Error('模型名重复');
    }

    // 上限校验
    const authCount = await Model.countDocuments({
      userId
    });
    if (authCount >= 5) {
      throw new Error('上限5个模型');
    }

    // 创建模型
    const response = await Model.create({
      name,
      userId,
      status: ModelStatusEnum.running,
      service: {
        company: serviceModelCompany,
        trainId: modelItem.trainName,
        chatModel: modelItem.model,
        modelName: modelItem.model
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
