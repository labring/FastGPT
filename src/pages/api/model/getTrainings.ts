import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Model, Training } from '@/service/mongo';
import { getOpenAIApi } from '@/service/utils/chat';
import formidable from 'formidable';
import { authToken, getUserOpenaiKey } from '@/service/utils/tools';
import { join } from 'path';
import fs from 'fs';
import type { ModelType } from '@/types/model';
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

    /* 获取 modelId 下的 training 记录 */
    const records = await Training.find({
      modelId
    });

    jsonRes(res, {
      data: records
    });
  } catch (err: any) {
    /* 清除上传的文件，关闭训练记录 */
    // @ts-ignore
    if (openai) {
      // @ts-ignore
      uploadFileId && openai.deleteFile(uploadFileId);
      // @ts-ignore
      trainId && openai.cancelFineTune(trainId);
    }

    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
