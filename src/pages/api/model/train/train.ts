// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Model, Training } from '@/service/mongo';
import formidable from 'formidable';
import { authToken, getUserApiOpenai } from '@/service/utils/tools';
import { join } from 'path';
import fs from 'fs';
import type { ModelSchema } from '@/types/mongoSchema';
import type { OpenAIApi } from 'openai';
import { ModelStatusEnum, TrainingStatusEnum } from '@/constants/model';
import { httpsAgent } from '@/service/utils/tools';

// 关闭next默认的bodyParser处理方式
export const config = {
  api: {
    bodyParser: false
  }
};

/* 上传文件，开始微调 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let openai: OpenAIApi, trainId: string, uploadFileId: string;

  try {
    const { authorization } = req.headers;

    if (!authorization) {
      throw new Error('无权操作');
    }
    const { modelId } = req.query;

    if (!modelId) {
      throw new Error('参数错误');
    }
    const userId = await authToken(authorization);

    await connectToDatabase();

    // 获取模型的状态
    const model = await Model.findById<ModelSchema>(modelId);

    if (!model || model.status !== 'running') {
      throw new Error('模型正忙');
    }

    // const trainingType = model.service.modelType
    const trainingType = model.service.trainId; // 目前都默认是 openai text-davinci-03

    // 获取用户的 API Key 实例化后的对象
    const user = await getUserApiOpenai(userId);
    openai = user.openai;

    // 接收文件并保存
    const form = formidable({
      uploadDir: join(process.cwd(), 'public/trainData'),
      keepExtensions: true
    });

    const { files } = await new Promise<{
      fields: formidable.Fields;
      files: formidable.Files;
    }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        resolve({ fields, files });
      });
    });
    const file = files.file;

    // 上传文件到 openai
    // @ts-ignore
    const uploadRes = await openai.createFile(
      // @ts-ignore
      fs.createReadStream(file.filepath),
      'fine-tune',
      { httpsAgent }
    );
    uploadFileId = uploadRes.data.id; // 记录上传文件的 ID

    // 开始训练
    const trainRes = await openai.createFineTune(
      {
        training_file: uploadFileId,
        model: trainingType,
        suffix: model.name,
        n_epochs: 4
      },
      { httpsAgent }
    );

    trainId = trainRes.data.id; // 记录训练 ID

    // 创建训练记录
    await Training.create({
      serviceName: 'openai',
      tuneId: trainId,
      status: TrainingStatusEnum.pending,
      modelId
    });

    // 修改模型状态
    await Model.findByIdAndUpdate(modelId, {
      $inc: {
        trainingTimes: +1
      },
      updateTime: new Date(),
      status: ModelStatusEnum.training
    });

    jsonRes(res, {
      data: 'start training'
    });
  } catch (err: any) {
    /* 清除上传的文件，关闭训练记录 */
    // @ts-ignore
    if (openai) {
      // @ts-ignore
      uploadFileId && openai.deleteFile(uploadFileId, { httpsAgent });
      // @ts-ignore
      trainId && openai.cancelFineTune(trainId, { httpsAgent });
    }

    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
