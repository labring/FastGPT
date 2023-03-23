import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Data, DataItem } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { generateQA } from '@/service/events/generateQA';

/* 定时删除那些不活跃的内容 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    let { text, name } = req.body as { text: string; name: string };
    if (!text || !name) {
      throw new Error('参数错误');
    }
    text = text.replace(/\n+/g, '\n');
    await connectToDatabase();

    const { authorization } = req.headers;

    const userId = await authToken(authorization);

    // 生成 data 父级
    const data = await Data.create({
      userId,
      name
    });

    const dataItems: any[] = [];

    // 格式化文本长度
    for (let i = 0; i <= text.length / 1000; i++) {
      const dataItem = {
        userId,
        dataId: data._id,
        text: text.slice(i * 1000, (i + 1) * 1000),
        status: 1
      };

      [0, 0.2, 0.4, 0.6, 0.8, 1.0].forEach((temperature) => {
        dataItems.push({
          temperature,
          ...dataItem
        });
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

/**
 * 检查文本是否按格式返回
 */
function splitText(text: string) {}
