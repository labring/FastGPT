import type { UserTypee } from '@fastgpt/global/support/user/type.d';
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

export interface QueryUserParams {
  username?: string;
  status?: string;
  pageNum?: number;
  pageSize?: number;
}

/* ================= data ===================== */
export type UserListItemType = {
  _id: string;
  status: string;
  username: string;
};
