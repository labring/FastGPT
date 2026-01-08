import type { UserType } from '@fastgpt/global/support/user/type';
import type { PromotionRecordSchema } from '@fastgpt/global/support/activity/type.d';
export interface LoginSuccessResponse {
  user: UserType;
  token: string;
}

export interface PromotionRecordType {
  _id: PromotionRecordSchema['_id'];
  type: PromotionRecordSchema['type'];
  createTime: PromotionRecordSchema['createTime'];
  amount: PromotionRecordSchema['amount'];
}
