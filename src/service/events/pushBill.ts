import { connectToDatabase, Bill, User } from '../mongo';
import { modelList, ChatModelNameEnum } from '@/constants/model';
import { encode } from 'gpt-token-utils';
import { formatPrice } from '@/utils/user';
import { BillTypeEnum } from '@/constants/user';
import type { DataType } from '@/types/data';

export const pushChatBill = async ({
  isPay,
  modelName,
  userId,
  chatId,
  text
}: {
  isPay: boolean;
  modelName: string;
  userId: string;
  chatId: string;
  text: string;
}) => {
  let billId;

  try {
    // 计算 token 数量
    const tokens = encode(text);

    console.log(`chat generate success. text len: ${text.length}. token len: ${tokens.length}`);

    if (isPay) {
      await connectToDatabase();

      // 获取模型单价格
      const modelItem = modelList.find((item) => item.model === modelName);
      // 计算价格
      const unitPrice = modelItem?.price || 5;
      const price = unitPrice * tokens.length;
      console.log(`unit price: ${unitPrice}, price: ${formatPrice(price)}元`);

      try {
        // 插入 Bill 记录
        const res = await Bill.create({
          userId,
          type: 'chat',
          modelName,
          chatId,
          textLen: text.length,
          tokenLen: tokens.length,
          price
        });
        billId = res._id;

        // 账号扣费
        await User.findByIdAndUpdate(userId, {
          $inc: { balance: -price }
        });
      } catch (error) {
        console.log('创建账单失败:', error);
        billId && Bill.findByIdAndDelete(billId);
      }
    }
  } catch (error) {
    console.log(error);
  }
};

export const pushSplitDataBill = async ({
  isPay,
  userId,
  text,
  type
}: {
  isPay: boolean;
  userId: string;
  text: string;
  type: DataType;
}) => {
  await connectToDatabase();

  let billId;

  try {
    // 计算 token 数量
    const tokens = encode(text);

    console.log(
      `splitData generate success. text len: ${text.length}. token len: ${tokens.length}`
    );

    if (isPay) {
      try {
        // 获取模型单价格, 都是用 gpt35 拆分
        const modelItem = modelList.find((item) => item.model === ChatModelNameEnum.GPT35);
        const unitPrice = modelItem?.price || 3;
        // 计算价格
        const price = unitPrice * tokens.length;

        console.log(`price: ${formatPrice(price)}元`);

        // 插入 Bill 记录
        const res = await Bill.create({
          userId,
          type,
          modelName: ChatModelNameEnum.GPT35,
          textLen: text.length,
          tokenLen: tokens.length,
          price
        });
        billId = res._id;

        // 账号扣费
        await User.findByIdAndUpdate(userId, {
          $inc: { balance: -price }
        });
      } catch (error) {
        console.log('创建账单失败:', error);
        billId && Bill.findByIdAndDelete(billId);
      }
    }
  } catch (error) {
    console.log(error);
  }
};

export const pushGenerateVectorBill = async ({
  isPay,
  userId,
  text
}: {
  isPay: boolean;
  userId: string;
  text: string;
}) => {
  await connectToDatabase();

  let billId;

  try {
    // 计算 token 数量
    const tokens = encode(text);

    console.log(`vector generate success. text len: ${text.length}. token len: ${tokens.length}`);

    if (isPay) {
      try {
        const unitPrice = 1;
        // 计算价格
        const price = unitPrice * tokens.length;

        console.log(`price: ${formatPrice(price)}元`);

        // 插入 Bill 记录
        const res = await Bill.create({
          userId,
          type: BillTypeEnum.vector,
          modelName: ChatModelNameEnum.VECTOR,
          textLen: text.length,
          tokenLen: tokens.length,
          price
        });
        billId = res._id;

        // 账号扣费
        await User.findByIdAndUpdate(userId, {
          $inc: { balance: -price }
        });
      } catch (error) {
        console.log('创建账单失败:', error);
        billId && Bill.findByIdAndDelete(billId);
      }
    }
  } catch (error) {
    console.log(error);
  }
};
