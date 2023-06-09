import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { customAlphabet } from 'nanoid';
import { connectToDatabase, Pay } from '@/service/mongo';
import { PRICE_SCALE } from '@/constants/common';
import { nativePay } from '@/service/utils/wxpay';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 20);

/* 获取支付二维码 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    let { amount = 0 } = req.query as { amount: string };
    amount = +amount;

    const { userId } = await authUser({ req, authToken: true });

    const id = nanoid();
    await connectToDatabase();

    const code_url = await nativePay(amount * 100, id);

    // 充值记录 + 1
    const payOrder = await Pay.create({
      userId,
      price: amount * PRICE_SCALE,
      orderId: id
    });

    jsonRes(res, {
      data: {
        payId: payOrder._id,
        codeUrl: code_url
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
