import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, User, Pay } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { PaySchema, UserModelSchema } from '@/types/mongoSchema';
import dayjs from 'dayjs';
import { getPayResult } from '@/service/utils/wxpay';
import { pushPromotionRecord } from '@/service/utils/promotion';
import { PRICE_SCALE } from '@/constants/common';

/* 校验支付结果 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    let { payId } = req.query as { payId: string };

    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    // 查找订单记录校验
    const payOrder = await Pay.findById<PaySchema>(payId);

    if (!payOrder) {
      throw new Error('订单不存在');
    }
    if (payOrder.status !== 'NOTPAY') {
      throw new Error('订单已结算');
    }

    // 获取当前用户
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('找不到用户');
    }
    // 获取邀请者
    let inviter: UserModelSchema | null = null;
    if (user.inviterId) {
      inviter = await User.findById(user.inviterId);
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
          // 推广佣金发放
          if (inviter) {
            pushPromotionRecord({
              userId: inviter._id,
              objUId: userId,
              type: 'invite',
              // amount 单位为元，需要除以缩放比例，最后乘比例
              amount: (payOrder.price / PRICE_SCALE) * inviter.promotion.rate * 0.01
            });
          }
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
