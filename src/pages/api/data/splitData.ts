import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, DataItem, Data } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { generateQA } from '@/service/events/generateQA';
import { generateAbstract } from '@/service/events/generateAbstract';

/* 拆分数据成QA */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { text, dataId } = req.body as { text: string; dataId: string };
    if (!text || !dataId) {
      throw new Error('参数错误');
    }
    await connectToDatabase();

    const { authorization } = req.headers;

    const userId = await authToken(authorization);

    const DataRecord = await Data.findById(dataId);

    if (!DataRecord) {
      throw new Error('找不到数据集');
    }
    const replaceText = text.replace(/[\r\n\\n]+/g, ' ');

    // 文本拆分成 chunk
    let chunks = replaceText.match(/[^!?.。]+[!?.。]/g) || [];

    const dataItems: any[] = [];
    let splitText = '';

    chunks.forEach((chunk) => {
      splitText += chunk;
      if (splitText.length >= 980) {
        dataItems.push({
          userId,
          dataId,
          type: DataRecord.type,
          text: splitText,
          status: 1
        });
        splitText = '';
      }
    });

    // 批量插入数据
    await DataItem.insertMany(dataItems);

    try {
      generateQA();
      generateAbstract();
    } catch (error) {
      error;
    }

    jsonRes(res, {
      data: { chunks, replaceText }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
