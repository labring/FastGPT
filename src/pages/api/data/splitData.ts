import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Data, DataItem } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { generateQA } from '@/service/events/generateQA';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    let { text, dataId } = req.body as { text: string; dataId: string };
    if (!text || !dataId) {
      throw new Error('参数错误');
    }
    text = text.replace(/\n+/g, '\n');
    await connectToDatabase();

    const { authorization } = req.headers;

    const userId = await authToken(authorization);

    const dataItems: any[] = [];

    // 格式化文本长度
    for (let i = 0; i <= text.length / 1000; i++) {
      dataItems.push({
        temperature: 0,
        userId,
        dataId,
        text: text.slice(i * 1000, (i + 1) * 1000),
        status: 1
      });
    }

    // 批量插入数据
    await DataItem.insertMany(dataItems);

    generateQA();

    jsonRes(res, {
      data: dataItems.length
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
