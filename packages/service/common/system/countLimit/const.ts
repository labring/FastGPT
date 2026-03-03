import z from 'zod';
import { CountLimitTypeEnum } from './type';

export const CountLimitConfigType = z.record(
  CountLimitTypeEnum,
  z.object({ maxCount: z.number() })
);

// 只会发送 n 次通知，如需自动发送，需要主动清除记录
export const CountLimitConfig = {
  [CountLimitTypeEnum.enum['notice:30PercentPoints']]: {
    maxCount: 3
  },
  [CountLimitTypeEnum.enum['notice:10PercentPoints']]: {
    maxCount: 5
  },
  [CountLimitTypeEnum.enum['notice:LackOfPoints']]: {
    maxCount: 5
  },
  [CountLimitTypeEnum.enum['notice:30PercentDatasetIndexes']]: {
    maxCount: 3
  },
  [CountLimitTypeEnum.enum['notice:10PercentDatasetIndexes']]: {
    maxCount: 5
  },
  [CountLimitTypeEnum.enum['notice:NoDatasetIndexes']]: {
    maxCount: 5
  }
} satisfies z.infer<typeof CountLimitConfigType>;
