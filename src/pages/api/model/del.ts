import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { Chat, Model, Training, connectToDatabase } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { getUserApiOpenai } from '@/service/utils/openai';
import { TrainingStatusEnum } from '@/constants/model';
import { TrainingItemType } from '@/types/training';
import { httpsAgent } from '@/service/utils/tools';
import { connectRedis } from '@/service/redis';
import { VecModelDataIdx } from '@/constants/redis';

/* 获取我的模型 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { modelId } = req.query;
    const { authorization } = req.headers;

    if (!authorization) {
      throw new Error('无权操作');
    }

    if (!modelId) {
      throw new Error('参数错误');
    }

    // 凭证校验
    const userId = await authToken(authorization);

    // 验证是否是该用户的 model
    const model = await Model.findOne({
      _id: modelId,
      userId
    });

    if (!model) {
      throw new Error('无权操作该模型');
    }

    await connectToDatabase();
    const redis = await connectRedis();

    // 获取 redis 中模型关联的所有数据
    const searchRes = await redis.ft.search(
      VecModelDataIdx,
      `@modelId:{${modelId}} @userId:{${userId}}`,
      {
        LIMIT: {
          from: 0,
          size: 10000
        }
      }
    );
    // 删除 redis 内容
    await Promise.all(searchRes.documents.map((item) => redis.del(item.id)));

    // 删除对应的聊天
    await Chat.deleteMany({
      modelId
    });

    // 查看是否正在训练
    const training: TrainingItemType | null = await Training.findOne({
      modelId,
      status: TrainingStatusEnum.pending
    });

    // 如果正在训练，需要删除openai上的相关信息
    if (training) {
      const { openai } = await getUserApiOpenai(userId);
      // 获取训练记录
      const tuneRecord = await openai.retrieveFineTune(training.tuneId, {
        httpsAgent: httpsAgent(false)
      });

      // 删除训练文件
      openai.deleteFile(tuneRecord.data.training_files[0].id, { httpsAgent: httpsAgent(false) });
      // 取消训练
      openai.cancelFineTune(training.tuneId, { httpsAgent: httpsAgent(false) });
    }

    // 删除对应训练记录
    await Training.deleteMany({
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
