import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, User, Pay, TrainingData } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { PaySchema, UserModelSchema } from '@/types/mongoSchema';
import dayjs from 'dayjs';
import { getPayResult } from '@/service/utils/wxpay';
import { pushPromotionRecord } from '@/service/utils/promotion';
import { PRICE_SCALE } from '@/constants/common';
import { startQueue } from '@/service/utils/tools';

/* 校验支付结果 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { payId } = req.query as { payId: string };

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
    const inviter = await (async () => {
      if (user.inviterId) {
        return User.findById(user.inviterId, '_id promotion');
      }
      return null;
    })();

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
          unlockTask(userId);
          return jsonRes(res, {
            data: '支付成功'
          });
        }
      } catch (error) {
        console.log(error);
        // roll back status
        try {
          await Pay.findByIdAndUpdate(payId, {
            status: 'NOTPAY'
          });
        } catch (error) {}
      }
      return jsonRes(res, {
        code: 500,
        data: '更新订单失败,请重试'
      });
    }
    if (payRes.trade_state === 'CLOSED' || diffInHours > 24) {
      // 订单已关闭
      await Pay.findByIdAndUpdate(payId, {
        status: 'CLOSED'
      });
      return jsonRes(res, {
        data: '订单已过期'
      });
    }
    throw new Error(payRes?.trade_state_desc || '订单无效');
  } catch (err) {
    // console.log(err);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

async function unlockTask(userId: string) {
  try {
    await TrainingData.updateMany(
      {
        userId
      },
      {
        lockTime: new Date('2000/1/1')
      }
    );
    startQueue();
  } catch (error) {
    unlockTask(userId);
  }
}
