import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, SplitData, Model } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { generateQA } from '@/service/events/generateQA';
import { encode } from 'gpt-token-utils';

/* 拆分数据成QA */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { text, modelId } = req.body as { text: string; modelId: string };
    if (!text || !modelId) {
      throw new Error('参数错误');
    }
    await connectToDatabase();

    const { authorization } = req.headers;

    const userId = await authToken(authorization);

    // 验证是否是该用户的 model
    const model = await Model.findOne({
      _id: modelId,
      userId
    });

    if (!model) {
      throw new Error('无权操作该模型');
    }

    const replaceText = text.replace(/(\\n|\n)+/g, ' ');

    // 文本拆分成 chunk
    let chunks = replaceText.match(/[^!?.。]+[!?.。]/g) || [];

    const textList: string[] = [];
    let splitText = '';

    /* 取 3k ~ 4K tokens 内容 */
    chunks.forEach((chunk) => {
      const tokens = encode(splitText + chunk).length;
      if (tokens >= 4000) {
        // 超过 4000，不要这块内容
        textList.push(splitText);
        splitText = chunk;
      } else if (tokens >= 3000) {
        // 超过 3000，取内容
        textList.push(splitText + chunk);
        splitText = '';
      } else {
        //没超过 3000，继续添加
        splitText += chunk;
      }
    });

    if (splitText) {
      textList.push(splitText);
    }

    // 批量插入数据
    await SplitData.create({
      userId,
      modelId,
      rawText: text,
      textList
    });

    generateQA();

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
