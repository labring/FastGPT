// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, DataItem, Data } from '@/service/mongo';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.headers.auth !== 'archer') {
      throw new Error('凭证错误');
    }
    await connectToDatabase();

    // await DataItem.updateMany(
    //   {},
    //   {
    //     times: 2
    //   }
    // );

    await Data.updateMany(
      {},
      {
        isDeleted: false
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
