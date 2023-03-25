// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Bill } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import type { BillSchema } from '@/types/mongoSchema';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.headers.auth !== 'archer') {
      throw new Error('凭证错误');
    }
    await connectToDatabase();

    const bills = await Bill.find({
      tokenLen: { $exists: false }
    });
    await Promise.all(
      bills.map((bill) =>
        Bill.findByIdAndUpdate(bill._id, {
          tokenLen: bill.textLen
        })
      )
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
