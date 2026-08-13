export type PromotionRecordSchema = {
  _id: string;
  userId: string;
  objUId?: string;
  type: 'register' | 'pay';
  createTime: Date;
  amount: number;
};
