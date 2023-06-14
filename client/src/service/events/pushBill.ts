import { connectToDatabase, Bill, User, ShareChat } from '../mongo';
import {
  ChatModelMap,
  OpenAiChatEnum,
  ChatModelType,
  embeddingModel,
  embeddingPrice
} from '@/constants/model';
import { BillTypeEnum } from '@/constants/user';

export const pushChatBill = async ({
  isPay,
  chatModel,
  userId,
  chatId,
  textLen,
  tokens,
  type
}: {
  isPay: boolean;
  chatModel: ChatModelType;
  userId: string;
  chatId?: '' | string;
  textLen: number;
  tokens: number;
  type: BillTypeEnum.chat | BillTypeEnum.openapiChat;
}) => {
  console.log(`chat generate success. text len: ${textLen}. token len: ${tokens}. pay:${isPay}`);
  if (!isPay) return;

  let billId = '';

  try {
    await connectToDatabase();

    // 计算价格
    const unitPrice = ChatModelMap[chatModel]?.price || 3;
    const price = unitPrice * tokens;

    try {
      // 插入 Bill 记录
      const res = await Bill.create({
        userId,
        type,
        modelName: chatModel,
        chatId: chatId ? chatId : undefined,
        textLen,
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
  } catch (error) {
    console.log(error);
  }
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
  isPay,
  userId,
  totalTokens,
  textLen,
  type
}: {
  isPay: boolean;
  userId: string;
  totalTokens: number;
  textLen: number;
  type: BillTypeEnum.QA;
}) => {
  console.log(
    `splitData generate success. text len: ${textLen}. token len: ${totalTokens}. pay:${isPay}`
  );
  if (!isPay) return;

  let billId;

  try {
    await connectToDatabase();

    // 获取模型单价格, 都是用 gpt35 拆分
    const unitPrice = ChatModelMap[OpenAiChatEnum.GPT3516k].price || 3;
    // 计算价格
    const price = unitPrice * totalTokens;

    // 插入 Bill 记录
    const res = await Bill.create({
      userId,
      type,
      modelName: OpenAiChatEnum.GPT3516k,
      textLen,
      tokenLen: totalTokens,
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
  // console.log(
  //   `vector generate success. text len: ${text.length}. token len: ${tokenLen}. pay:${isPay}`
  // );
  if (!isPay) return;

  let billId;

  try {
    await connectToDatabase();

    try {
      // 计算价格. 至少为1
      let price = embeddingPrice * tokenLen;
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
  } catch (error) {
    console.log(error);
  }
};
