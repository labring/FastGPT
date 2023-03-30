// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, DataItem, Data } from '@/service/mongo';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (process.env.NODE_ENV !== 'development') {
      throw new Error('不是开发环境');
    }
    await connectToDatabase();

    // await DataItem.updateMany(
    //   {},
    //   {
    //     type: 'QA'
    //     // times: 2
    //   }
    // );

    await Data.updateMany(
      {},
      {
        type: 'QA'
      }
    );

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
