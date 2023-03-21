import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import axios from 'axios';
import { connectToDatabase, User, Pay } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { formatPrice } from '@/utils/user';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { authorization } = req.headers;
    let { orderId } = req.query as { orderId: string };

    const userId = await authToken(authorization);

    const { data } = await axios.get(
      `https://sif268.laf.dev/wechat-order-query?order_number=${orderId}&api_key=${process.env.WXPAYCODE}`
    );

    if (data.trade_state === 'SUCCESS') {
      await connectToDatabase();

      // 重复记录校验
      const count = await Pay.count({
        orderId
      });

      if (count > 0) {
        throw new Error('订单重复，请刷新');
      }

      // 计算实际充值。把分转成数据库的值
      const price = data.amount.total * 0.01 * 100000;
      let payId;
      try {
        // 充值记录 +1
        const payRecord = await Pay.create({
          userId,
          price,
          orderId
        });
        payId = payRecord._id;
        // 充钱
        await User.findByIdAndUpdate(userId, {
          $inc: { balance: price }
        });
      } catch (error) {
        payId && Pay.findByIdAndDelete(payId);
      }

      jsonRes(res, {
        data: 'success'
      });
    } else {
      throw new Error(data.trade_state_desc);
    }
  } catch (err) {
    console.log(err);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
