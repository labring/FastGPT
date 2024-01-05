import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { delay } from '@fastgpt/global/common/system/utils';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { jiebaSplit } from '@/service/common/string/jieba';

let success = 0;
/* pg 中的数据搬到 mongo dataset.datas 中，并做映射 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { limit = 50 } = req.body as { limit: number };
    await authCert({ req, authRoot: true });
    await connectToDatabase();
    success = 0;

    console.log(
      'total',
      await MongoDatasetData.countDocuments({
        fullTextToken: { $exists: false },
        updateTime: { $lt: new Date() }
      })
    );

    await initFullTextToken(limit, new Date());

    jsonRes(res, {
      message: 'success'
    });
  } catch (error) {
    console.log(error);

    jsonRes(res, {
      code: 500,
      error
    });
  }
}
export async function initFullTextToken(limit = 50, endDate: Date): Promise<any> {
  try {
    const dataList = await MongoDatasetData.find(
      { fullTextToken: { $exists: false }, updateTime: { $lt: endDate } },
      '_id q a'
    )
      .limit(limit)
      .lean();
    if (dataList.length === 0) return;

    const result = await Promise.allSettled(
      dataList.map((item) => {
        const text = item.q + (item.a || '');
        const tokens = jiebaSplit({ text });

        return MongoDatasetData.findByIdAndUpdate(item._id, {
          $set: {
            fullTextToken: tokens
          }
        });
      })
    );

    success += result.filter((item) => item.status === 'fulfilled').length;
    console.log(`success: ${success}`);
    return initFullTextToken(limit, endDate);
  } catch (error) {
    await delay(1000);
    return initFullTextToken(limit, endDate);
  }
}
