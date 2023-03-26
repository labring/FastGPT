import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, DataItem, Data } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { generateQA } from '@/service/events/generateQA';
import { generateAbstract } from '@/service/events/generateAbstract';

/* 拆分数据成QA */
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

    const DataRecord = await Data.findById(dataId);

    if (!DataRecord) {
      throw new Error('找不到数据集');
    }

    const dataItems: any[] = [];

    // 每 1000 字符一组
    for (let i = 0; i <= text.length / 1000; i++) {
      dataItems.push({
        userId,
        dataId,
        type: DataRecord.type,
        text: text.slice(i * 1000, (i + 1) * 1000),
        status: 1
      });
    }

    // 批量插入数据
    await DataItem.insertMany(dataItems);

    try {
      generateQA();
      generateAbstract();
    } catch (error) {
      error;
    }

    jsonRes(res, {
      data: ''
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
