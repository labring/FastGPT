import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import axios from 'axios';
import { connectToDatabase, User, Pay } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { PaySchema } from '@/types/mongoSchema';
import dayjs from 'dayjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { authorization } = req.headers;
    let { payId } = req.query as { payId: string };

    const userId = await authToken(authorization);

    await connectToDatabase();

    // 查找订单记录校验
    const payOrder = await Pay.findById<PaySchema>(payId);

    if (!payOrder) {
      throw new Error('订单不存在');
    }
    if (payOrder.status !== 'NOTPAY') {
      throw new Error('订单已结算');
    }

    const { data } = await axios.get(
      `https://sif268.laf.dev/wechat-order-query?order_number=${payOrder.orderId}&api_key=${process.env.WXPAYCODE}`
    );

    // 校验下是否超过一天
    const orderTime = dayjs(payOrder.createTime);
    const diffInHours = dayjs().diff(orderTime, 'hours');

    if (data.trade_state === 'SUCCESS') {
      // 订单已支付
      try {
        // 更新订单状态
        const updateRes = await Pay.updateOne(
          {
            _id: payId,
            status: 'NOTPAY'
          },
          {
            status: 'SUCCESS'
          }
        );
        if (updateRes.modifiedCount === 1) {
          // 给用户账号充钱
          await User.findByIdAndUpdate(userId, {
            $inc: { balance: payOrder.price }
          });
          jsonRes(res, {
            data: '支付成功'
          });
        }
      } catch (error) {
        await Pay.findByIdAndUpdate(payId, {
          status: 'NOTPAY'
        });
        console.log(error);
      }
    } else if (data.trade_state === 'CLOSED' || diffInHours > 24) {
      // 订单已关闭
      await Pay.findByIdAndUpdate(payId, {
        status: 'CLOSED'
      });
      jsonRes(res, {
        data: '订单已过期'
      });
    } else {
      throw new Error(data.trade_state_desc);
    }
  } catch (err) {
    // console.log(err);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
