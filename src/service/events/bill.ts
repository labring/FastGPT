import { connectToDatabase, Bill, User } from '../mongo';
import { modelList } from '@/constants/model';

export const pushBill = async ({
  modelName,
  userId,
  chatId,
  textLen
}: {
  modelName: string;
  userId: string;
  chatId: string;
  textLen: number;
}) => {
  await connectToDatabase();

  const modelItem = modelList.find((item) => item.model === modelName);

  if (!modelItem) return;

  let billId;

  try {
    await connectToDatabase();

    const modelItem = modelList.find((item) => item.model === modelName);

    if (!modelItem) return;

    const price = modelItem.price * textLen;

    try {
      // 插入 Bill 记录
      const res = await Bill.create({
        userId,
        chatId,
        textLen,
        price
      });
      billId = res._id;

      // 扣费
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
