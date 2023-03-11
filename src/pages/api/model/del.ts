import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { Chat, Model, Training, connectToDatabase } from '@/service/mongo';
import { authToken, getUserOpenaiKey } from '@/service/utils/tools';
import { TrainingStatusEnum } from '@/constants/model';
import { getOpenAIApi } from '@/service/utils/chat';
import { TrainingItemType } from '@/types/training';
import { httpsAgent } from '@/service/utils/tools';

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

    // 删除模型
    await Model.deleteOne({
      _id: modelId,
      userId
    });

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
      const openai = getOpenAIApi(await getUserOpenaiKey(userId));
      // 获取训练记录
      const tuneRecord = await openai.retrieveFineTune(training.tuneId, { httpsAgent });

      // 删除训练文件
      openai.deleteFile(tuneRecord.data.training_files[0].id, { httpsAgent });
      // 取消训练
      openai.cancelFineTune(training.tuneId, { httpsAgent });
    }

    // 删除对应训练记录
    await Training.deleteMany({
      modelId
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
