export type FrequencyLimitSchemaType = {
  _id: string;
  eventId: string; // 事件ID
  amount: number; // 当前数量
  expiredTime: Date; // 什么时候过期，过期则重置
};
