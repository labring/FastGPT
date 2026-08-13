import type { PromotionRecordSchema } from '@fastgpt/global/support/activity/type';

export interface PromotionRecordType {
  _id: PromotionRecordSchema['_id'];
  type: PromotionRecordSchema['type'];
  createTime: PromotionRecordSchema['createTime'];
  amount: PromotionRecordSchema['amount'];
}
