import { connectToDatabase, Bill, User } from '../mongo';
import { modelList, ChatModelNameEnum } from '@/constants/model';
import { encode } from 'gpt-token-utils';
import { formatPrice } from '@/utils/user';

export const pushChatBill = async ({
  modelName,
  userId,
  chatId,
  text
}: {
  modelName: string;
  userId: string;
  chatId: string;
  text: string;
}) => {
  await connectToDatabase();

  let billId;

  try {
    // 获取模型单价格
    const modelItem = modelList.find((item) => item.model === modelName);
    const unitPrice = modelItem?.price || 5;

    // 计算 token 数量
    const tokens = encode(text);

    // 计算价格
    const price = unitPrice * tokens.length;
    console.log('chat bill');
    console.log('token len:', tokens.length);
    console.log('text len: ', text.length);
    console.log('price: ', `${formatPrice(price)}元`);

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
  } catch (error) {
    console.log(error);
  }
};

export const pushSplitDataBill = async ({ userId, text }: { userId: string; text: string }) => {
  await connectToDatabase();

  let billId;

  try {
    // 获取模型单价格, 都是用 gpt35 拆分
    const modelItem = modelList.find((item) => item.model === ChatModelNameEnum.GPT35);
    const unitPrice = modelItem?.price || 5;

    // 计算 token 数量
    const tokens = encode(text);

    // 计算价格
    const price = unitPrice * tokens.length;
    console.log('splitData bill');
    console.log('token len:', tokens.length);
    console.log('text len: ', text.length);
    console.log('price: ', `${formatPrice(price)}元`);

    try {
      // 插入 Bill 记录
      const res = await Bill.create({
        userId,
        type: 'splitData',
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
  } catch (error) {
    console.log(error);
  }
};
