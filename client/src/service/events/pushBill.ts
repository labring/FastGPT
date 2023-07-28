import { connectToDatabase, Bill, User, OutLink } from '../mongo';
import { BillSourceEnum } from '@/constants/user';
import { getModel } from '../utils/data';
import { ChatHistoryItemResType } from '@/types/chat';
import { formatPrice } from '@/utils/user';

export const pushTaskBill = async ({
  appName,
  appId,
  userId,
  source,
  shareId,
  response
}: {
  appName: string;
  appId: string;
  userId: string;
  source: `${BillSourceEnum}`;
  shareId?: string;
  response: ChatHistoryItemResType[];
}) => {
  const total = response.reduce((sum, item) => sum + item.price, 0) || 1;

  await Promise.allSettled([
    Bill.create({
      userId,
      appName,
      appId,
      total,
      source,
      list: response.map((item) => ({
        moduleName: item.moduleName,
        amount: item.price || 0,
        model: item.model,
        tokenLen: item.tokens
      }))
    }),
    User.findByIdAndUpdate(userId, {
      $inc: { balance: -total }
    }),
    ...(shareId
      ? [
          updateShareChatBill({
            shareId,
            total
          })
        ]
      : [])
  ]);

  console.log('finish bill:', formatPrice(total));
};

export const updateShareChatBill = async ({
  shareId,
  total
}: {
  shareId: string;
  total: number;
}) => {
  try {
    await OutLink.findOneAndUpdate(
      { shareId },
      {
        $inc: { total },
        lastTime: new Date()
      }
    );
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
