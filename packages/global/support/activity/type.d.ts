export type PromotionRecordSchema = {
  _id: string;
  userId: string; // 收益人
  objUId?: string; // 目标对象（如果是withdraw则为空）
  type: 'register' | 'pay';
  createTime: Date; // 记录时间
  amount: number;
};
