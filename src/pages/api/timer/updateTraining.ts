// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Training, Model } from '@/service/mongo';
import type { TrainingItemType } from '@/types/training';
import { TrainingStatusEnum, ModelStatusEnum } from '@/constants/model';
import { getUserApiOpenai } from '@/service/utils/openai';
import { OpenAiTuneStatusEnum } from '@/service/constants/training';
import { sendTrainSucceed } from '@/service/utils/sendEmail';
import { httpsAgent } from '@/service/utils/tools';
import { ModelPopulate } from '@/types/mongoSchema';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('不是开发环境');
  }
  try {
    await connectToDatabase();

    // 查询正在训练中的训练记录
    const trainingRecords: TrainingItemType[] = await Training.find({
      status: TrainingStatusEnum.pending
    });

    const { openai } = await getUserApiOpenai('63f9a14228d2a688d8dc9e1b');

    const response = await Promise.all(
      trainingRecords.map(async (item) => {
        const { data } = await openai.retrieveFineTune(item.tuneId, { httpsAgent });
        if (data.status === OpenAiTuneStatusEnum.succeeded) {
          // 删除训练文件
          openai.deleteFile(data.training_files[0].id, { httpsAgent });

          const model = await Model.findById<ModelPopulate>(item.modelId).populate({
            path: 'userId',
            options: {
              strictPopulate: false
            }
          });

          if (!model) {
            throw new Error('模型不存在');
          }

          // 更新模型
          await Model.findByIdAndUpdate(item.modelId, {
            status: ModelStatusEnum.running,
            updateTime: new Date(),
            service: {
              ...model.service,
              trainId: data.fine_tuned_model, // 训练完后，再次训练和对话使用的 model 是一样的
              chatModel: data.fine_tuned_model
            }
          });
          // 更新训练数据
          await Training.findByIdAndUpdate(item._id, {
            status: TrainingStatusEnum.succeed
          });

          // 发送邮件通知
          await sendTrainSucceed(model.userId.email as string, model.name);
          return 'succeed';
        }
        return 'pending';
      })
    );

    jsonRes(res, {
      data: `${response.length}个训练线程，${
        response.filter((item) => item === 'succeed').length
      }个完成`
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
