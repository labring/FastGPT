import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { UserModelSchema } from '@fastgpt/global/support/user/type';
import { LafAccountType } from '@fastgpt/global/support/user/team/type.d';

export interface UserUpdateParams {
  balance?: number;
  avatar?: string;
  timezone?: string;
  openaiAccount?: UserModelSchema['openaiAccount'];
  lafAccount?: LafAccountType;
}
