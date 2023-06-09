import { promotionRecord } from '../mongo';

export const pushPromotionRecord = async ({
  userId,
  objUId,
  type,
  amount
}: {
  userId: string;
  objUId: string;
  type: 'invite' | 'shareModel';
  amount: number;
}) => {
  try {
    await promotionRecord.create({
      userId,
      objUId,
      type,
      amount
    });
  } catch (error) {
    console.log('创建推广记录异常', error);
  }
};

export const withdrawRecord = async ({ userId, amount }: { userId: string; amount: number }) => {
  try {
    await promotionRecord.create({
      userId,
      type: 'withdraw',
      amount
    });
  } catch (error) {
    console.log('提现记录异常', error);
  }
};
