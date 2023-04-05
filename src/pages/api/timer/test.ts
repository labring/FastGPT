// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, SplitData } from '@/service/mongo';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (process.env.NODE_ENV !== 'development') {
      throw new Error('不是开发环境');
    }
    await connectToDatabase();

    const data = await SplitData.aggregate([
      { $match: { textList: { $exists: true, $ne: [] } } },
      { $sample: { size: 1 } }
    ]);

    const dataItem: any = data[0];
    const textList: string[] = dataItem.textList.slice(-5);
    console.log(textList);
    console.log(dataItem.textList.slice(0, -5));
    await SplitData.findByIdAndUpdate(dataItem._id, {
      textList: dataItem.textList.slice(0, -5)
    });

    jsonRes(res, {
      data: {}
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
