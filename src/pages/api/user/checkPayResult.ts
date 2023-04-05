import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, User, Pay } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { PaySchema } from '@/types/mongoSchema';
import dayjs from 'dayjs';
import { getPayResult } from '@/service/utils/wxpay';

/* 校验支付结果 */
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

    const payRes = await getPayResult(payOrder.orderId);

    // 校验下是否超过一天
    const orderTime = dayjs(payOrder.createTime);
    const diffInHours = dayjs().diff(orderTime, 'hours');

    if (payRes.trade_state === 'SUCCESS') {
      // 订单已支付
      try {
        // 更新订单状态. 如果没有合适的订单，说明订单重复了
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
    } else if (payRes.trade_state === 'CLOSED' || diffInHours > 24) {
      // 订单已关闭
      await Pay.findByIdAndUpdate(payId, {
        status: 'CLOSED'
      });
      jsonRes(res, {
        data: '订单已过期'
      });
    } else {
      throw new Error(payRes?.trade_state_desc || '订单无效');
    }
  } catch (err) {
    // console.log(err);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
