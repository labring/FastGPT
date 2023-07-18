import { connectToDatabase, Bill, User, ShareChat } from '../mongo';
import { BillSourceEnum } from '@/constants/user';
import { getModel } from '../utils/data';
import type { BillListItemType } from '@/types/mongoSchema';
import { formatPrice } from '@/utils/user';

export const createTaskBill = async ({
  appName,
  appId,
  userId,
  source
}: {
  appName: string;
  appId: string;
  userId: string;
  source: `${BillSourceEnum}`;
}) => {
  const res = await Bill.create({
    userId,
    appName,
    appId,
    total: 0,
    source,
    list: []
  });
  return String(res._id);
};

export const pushTaskBillListItem = async ({
  billId,
  moduleName,
  amount,
  model,
  tokenLen
}: { billId?: string } & BillListItemType) => {
  if (!billId) return;
  try {
    await Bill.findByIdAndUpdate(billId, {
      $push: {
        list: {
          moduleName,
          amount,
          model,
          tokenLen
        }
      }
    });
  } catch (error) {}
};
export const finishTaskBill = async ({ billId }: { billId: string }) => {
  try {
    // update bill
    const res = await Bill.findByIdAndUpdate(billId, [
      {
        $set: {
          total: {
            $sum: '$list.amount'
          },
          time: new Date()
        }
      }
    ]);
    if (!res) return;
    const total = res.list.reduce((sum, item) => sum + item.amount, 0) || 0;

    console.log('finish bill:', formatPrice(total));

    // 账号扣费
    await User.findByIdAndUpdate(res.userId, {
      $inc: { balance: -total }
    });
  } catch (error) {
    console.log('Finish bill failed:', error);
    billId && Bill.findByIdAndDelete(billId);
  }
};

export const delTaskBill = async (billId?: string) => {
  if (!billId) return;

  try {
    await Bill.findByIdAndRemove(billId);
  } catch (error) {}
};

export const updateShareChatBill = async ({
  shareId,
  tokens
}: {
  shareId: string;
  tokens: number;
}) => {
  try {
    await ShareChat.findByIdAndUpdate(shareId, {
      $inc: { tokens },
      lastTime: new Date()
    });
  } catch (error) {
    console.log('update shareChat error', error);
  }
};

export const pushSplitDataBill = async ({
  userId,
  totalTokens,
  model,
  appName
}: {
  model: string;
  userId: string;
  totalTokens: number;
  appName: string;
}) => {
  console.log(`splitData generate success. token len: ${totalTokens}.`);

  let billId;

  try {
    await connectToDatabase();

    // 获取模型单价格, 都是用 gpt35 拆分
    const unitPrice = global.chatModels.find((item) => item.model === model)?.price || 3;
    // 计算价格
    const total = unitPrice * totalTokens;

    // 插入 Bill 记录
    const res = await Bill.create({
      userId,
      appName,
      tokenLen: totalTokens,
      total
    });
    billId = res._id;

    // 账号扣费
    await User.findByIdAndUpdate(userId, {
      $inc: { balance: -total }
    });
  } catch (error) {
    console.log('创建账单失败:', error);
    billId && Bill.findByIdAndDelete(billId);
  }
};

export const pushGenerateVectorBill = async ({
  userId,
  tokenLen,
  model
}: {
  userId: string;
  tokenLen: number;
  model: string;
}) => {
  let billId;

  try {
    await connectToDatabase();

    try {
      // 计算价格. 至少为1
      const unitPrice = global.vectorModels.find((item) => item.model === model)?.price || 0.2;
      let total = unitPrice * tokenLen;
      total = total > 1 ? total : 1;

      // 插入 Bill 记录
      const res = await Bill.create({
        userId,
        model,
        appName: '索引生成',
        total
      });
      billId = res._id;

      // 账号扣费
      await User.findByIdAndUpdate(userId, {
        $inc: { balance: -total }
      });
    } catch (error) {
      console.log('创建账单失败:', error);
      billId && Bill.findByIdAndDelete(billId);
    }
  } catch (error) {
    console.log(error);
  }
};

export const countModelPrice = ({ model, tokens }: { model: string; tokens: number }) => {
  const modelData = getModel(model);
  if (!modelData) return 0;
  return modelData.price * tokens;
};
