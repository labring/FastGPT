import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { Chat, Model, Training, connectToDatabase, ModelData } from '@/service/mongo';
import { authToken, getUserApiOpenai } from '@/service/utils/tools';
import { TrainingStatusEnum } from '@/constants/model';
import { getOpenAIApi } from '@/service/utils/chat';
import { TrainingItemType } from '@/types/training';
import { httpsAgent } from '@/service/utils/tools';
import { connectRedis } from '@/service/redis';
import { VecModelDataIndex } from '@/constants/redis';

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

    await connectToDatabase();
    const redis = await connectRedis();

    const modelDataList = await ModelData.find({
      modelId
    });

    // 删除 redis
    modelDataList?.forEach((modelData) =>
      modelData.q.forEach(async (item) => {
        try {
          await redis.json.del(`${VecModelDataIndex}:${item.id}`);
        } catch (error) {
          console.log(error);
        }
      })
    );

    let requestQueue: any[] = [];
    // 删除对应的聊天
    requestQueue.push(
      Chat.deleteMany({
        modelId
      })
    );

    // 删除数据集
    requestQueue.push(
      ModelData.deleteMany({
        modelId
      })
    );

    // 查看是否正在训练
    const training: TrainingItemType | null = await Training.findOne({
      modelId,
      status: TrainingStatusEnum.pending
    });

    // 如果正在训练，需要删除openai上的相关信息
    if (training) {
      const { openai } = await getUserApiOpenai(userId);
      // 获取训练记录
      const tuneRecord = await openai.retrieveFineTune(training.tuneId, { httpsAgent });

      // 删除训练文件
      openai.deleteFile(tuneRecord.data.training_files[0].id, { httpsAgent });
      // 取消训练
      openai.cancelFineTune(training.tuneId, { httpsAgent });
    }

    // 删除对应训练记录
    requestQueue.push(
      Training.deleteMany({
        modelId
      })
    );

    // 删除模型
    requestQueue.push(
      Model.deleteOne({
        _id: modelId,
        userId
      })
    );

    await Promise.all(requestQueue);

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
