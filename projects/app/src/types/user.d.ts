import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { UserModelSchema } from '@fastgpt/global/support/user/type';

export interface UserUpdateParams {
  balance?: number;
  avatar?: string;
  timezone?: string;
}
