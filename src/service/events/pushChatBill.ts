import { connectToDatabase, Bill, User } from '../mongo';
import { modelList } from '@/constants/model';
import { encode } from 'gpt-token-utils';
import { formatPrice } from '@/utils/user';

export const pushBill = async ({
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
    console.log('token len:', tokens.length, 'price: ', `${formatPrice(price)}元`);

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
      billId && Bill.findByIdAndDelete(billId);
    }
  } catch (error) {
    console.log(error);
  }
};
