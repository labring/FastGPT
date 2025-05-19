import { AuthFrequencyLimitProps } from '@fastgpt/global/common/frequenctLimit/type';
import { MongoFrequencyLimit } from './schema';

export const authFrequencyLimit = async ({
  eventId,
  maxAmount,
  expiredTime
}: AuthFrequencyLimitProps) => {
  try {
    // 对应 eventId 的 account+1, 不存在的话，则创建一个
    const result = await MongoFrequencyLimit.findOneAndUpdate(
      {
        eventId,
        expiredTime: { $gte: new Date() }
      },
      {
        $inc: { amount: 1 },
        // If not exist, set the expiredTime
        $setOnInsert: { expiredTime }
      },
      {
        upsert: true,
        new: true
      }
    ).lean();
    // 因为始终会返回+1的结果，所以这里不能直接等，需要多一个。
    if (result.amount > maxAmount) {
      return Promise.reject(result);
    }
  } catch (error) {
    console.log(error);
  }
};
