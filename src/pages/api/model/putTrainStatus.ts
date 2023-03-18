import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Model, Training } from '@/service/mongo';
import { getOpenAIApi } from '@/service/utils/chat';
import { authToken, getUserOpenaiKey } from '@/service/utils/tools';
import type { ModelSchema } from '@/types/mongoSchema';
import { TrainingItemType } from '@/types/training';
import { ModelStatusEnum, TrainingStatusEnum } from '@/constants/model';
import { OpenAiTuneStatusEnum } from '@/service/constants/training';
import { httpsAgent } from '@/service/utils/tools';

/* 更新训练状态 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { authorization } = req.headers;

    if (!authorization) {
      throw new Error('无权操作');
    }
    const { modelId } = req.query as { modelId: string };
    if (!modelId) {
      throw new Error('参数错误');
    }
    const userId = await authToken(authorization);

    await connectToDatabase();

    // 获取模型
    const model = await Model.findById<ModelSchema>(modelId);

    if (!model || model.status !== 'training') {
      throw new Error('模型不在训练中');
    }

    // 查询正在训练中的训练记录
    const training: TrainingItemType | null = await Training.findOne({
      modelId,
      status: 'pending'
    });

    if (!training) {
      throw new Error('找不到训练记录');
    }

    // 用户的 openai 实例
    const openai = getOpenAIApi(await getUserOpenaiKey(userId));

    // 获取 openai 的训练情况
    const { data } = await openai.retrieveFineTune(training.tuneId, { httpsAgent });

    if (data.status === OpenAiTuneStatusEnum.succeeded) {
      // 删除训练文件
      openai.deleteFile(data.training_files[0].id, { httpsAgent });

      // 更新模型
      await Model.findByIdAndUpdate(modelId, {
        status: ModelStatusEnum.running,
        updateTime: new Date(),
        service: {
          ...model.service,
          trainId: data.fine_tuned_model, // 训练完后，再次训练和对话使用的 model 是一样的
          chatModel: data.fine_tuned_model
        }
      });
      // 更新训练数据
      await Training.findByIdAndUpdate(training._id, {
        status: TrainingStatusEnum.succeed
      });

      return jsonRes(res, {
        data: '模型微调完成'
      });
    }

    if (data.status === OpenAiTuneStatusEnum.cancelled) {
      // 删除训练文件
      openai.deleteFile(data.training_files[0].id, { httpsAgent });

      // 更新模型
      await Model.findByIdAndUpdate(modelId, {
        status: ModelStatusEnum.running,
        updateTime: new Date()
      });
      // 更新训练数据
      await Training.findByIdAndUpdate(training._id, {
        status: TrainingStatusEnum.canceled
      });

      return jsonRes(res, {
        data: '模型微调取消'
      });
    }

    throw new Error('模型还在训练中');
  } catch (err: any) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
