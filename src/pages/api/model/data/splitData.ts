import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, SplitData, Model } from '@/service/mongo';
import { authToken } from '@/service/utils/auth';
import { generateVector } from '@/service/events/generateVector';
import { generateQA } from '@/service/events/generateQA';
import { PgClient } from '@/service/pg';

/* 拆分数据成QA */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { chunks, modelId, prompt, mode } = req.body as {
      modelId: string;
      chunks: string[];
      prompt: string;
      mode: 'qa' | 'subsection';
    };
    if (!chunks || !modelId || !prompt) {
      throw new Error('参数错误');
    }
    await connectToDatabase();

    const userId = await authToken(req);

    // 验证是否是该用户的 model
    const model = await Model.findOne({
      _id: modelId,
      userId
    });

    if (!model) {
      throw new Error('无权操作该模型');
    }

    if (mode === 'qa') {
      // 批量QA拆分插入数据
      await SplitData.create({
        userId,
        modelId,
        textList: chunks,
        prompt
      });

      generateQA();
    } else if (mode === 'subsection') {
      // 插入记录
      await PgClient.insert('modelData', {
        values: chunks.map((item) => [
          { key: 'user_id', value: userId },
          { key: 'model_id', value: modelId },
          { key: 'q', value: item },
          { key: 'a', value: '' },
          { key: 'status', value: 'waiting' }
        ])
      });

      generateVector();
    }

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};
