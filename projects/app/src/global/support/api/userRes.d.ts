import type { UserType } from '@/types/user';
import type { PromotionRecordSchema } from '@fastgpt/global/support/activity/type.d';
export interface ResLogin {
  user: UserType;
  token: string;
}

export interface PromotionRecordType {
  _id: PromotionRecordSchema['_id'];
  type: PromotionRecordSchema['type'];
  createTime: PromotionRecordSchema['createTime'];
  amount: PromotionRecordSchema['amount'];
}
