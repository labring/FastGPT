import { connectToDatabase, Bill, User } from '../mongo';
import { modelList, ChatModelEnum, embeddingModel } from '@/constants/model';
import { BillTypeEnum } from '@/constants/user';
import { countChatTokens } from '@/utils/tools';

export const pushChatBill = async ({
  isPay,
  chatModel,
  userId,
  chatId,
  messages
}: {
  isPay: boolean;
  chatModel: `${ChatModelEnum}`;
  userId: string;
  chatId?: '' | string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
}) => {
  let billId = '';

  try {
    // 计算 token 数量
    const tokens = countChatTokens({ model: chatModel, messages });
    const text = messages.map((item) => item.content).join('');

    console.log(
      `chat generate success. text len: ${text.length}. token len: ${tokens}. pay:${isPay}`
    );

    if (isPay) {
      await connectToDatabase();

      // 获取模型单价格
      const modelItem = modelList.find((item) => item.chatModel === chatModel);
      // 计算价格
      const unitPrice = modelItem?.price || 5;
      const price = unitPrice * tokens;

      try {
        // 插入 Bill 记录
        const res = await Bill.create({
          userId,
          type: 'chat',
          modelName: chatModel,
          chatId: chatId ? chatId : undefined,
          textLen: text.length,
          tokenLen: tokens,
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
  tokenLen,
  text,
  type
}: {
  isPay: boolean;
  userId: string;
  tokenLen: number;
  text: string;
  type: `${BillTypeEnum}`;
}) => {
  await connectToDatabase();

  let billId;

  try {
    console.log(
      `splitData generate success. text len: ${text.length}. token len: ${tokenLen}. pay:${isPay}`
    );

    if (isPay) {
      try {
        // 获取模型单价格, 都是用 gpt35 拆分
        const modelItem = modelList.find((item) => item.chatModel === ChatModelEnum.GPT35);
        const unitPrice = modelItem?.price || 3;
        // 计算价格
        const price = unitPrice * tokenLen;

        // 插入 Bill 记录
        const res = await Bill.create({
          userId,
          type,
          modelName: ChatModelEnum.GPT35,
          textLen: text.length,
          tokenLen,
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
  text,
  tokenLen
}: {
  isPay: boolean;
  userId: string;
  text: string;
  tokenLen: number;
}) => {
  await connectToDatabase();

  let billId;

  try {
    console.log(
      `vector generate success. text len: ${text.length}. token len: ${tokenLen}. pay:${isPay}`
    );

    if (isPay) {
      try {
        const unitPrice = 0.4;
        // 计算价格. 至少为1
        let price = unitPrice * tokenLen;
        price = price > 1 ? price : 1;

        // 插入 Bill 记录
        const res = await Bill.create({
          userId,
          type: BillTypeEnum.vector,
          modelName: embeddingModel,
          textLen: text.length,
          tokenLen,
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
