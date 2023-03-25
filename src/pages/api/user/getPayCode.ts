// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import axios from 'axios';
import { authToken } from '@/service/utils/tools';
import { customAlphabet } from 'nanoid';
import { connectToDatabase, Pay } from '@/service/mongo';
import { PRICE_SCALE } from '@/constants/common';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 20);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { authorization } = req.headers;
    let { amount = 0 } = req.query as { amount: string };
    amount = +amount;

    if (!authorization) {
      throw new Error('缺少登录凭证');
    }
    const userId = await authToken(authorization);

    const id = nanoid();
    await connectToDatabase();

    const response = await axios({
      url: 'https://sif268.laf.dev/wechat-pay',
      method: 'POST',
      data: {
        trade_order_number: id,
        amount: amount * 100,
        api_key: process.env.WXPAYCODE
      }
    });

    // 充值记录 + 1
    const payOrder = await Pay.create({
      userId,
      price: amount * PRICE_SCALE,
      orderId: id
    });

    jsonRes(res, {
      data: {
        payId: payOrder._id,
        codeUrl: response.data?.code_url
      }
    });
  } catch (err) {
    console.log(err);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
