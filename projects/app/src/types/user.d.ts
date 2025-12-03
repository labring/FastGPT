import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { UserModelSchema } from '@fastgpt/global/support/user/type';
import type { UserType } from '@fastgpt/global/support/user/type';

export interface UserUpdateParams {
  avatar?: string;
  timezone?: string;
  language?: UserType['language'];
  /** @deprecated */
  balance?: number;
}
