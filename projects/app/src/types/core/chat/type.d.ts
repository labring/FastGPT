import type { NextApiResponse } from 'next';
import { RunningModuleItemType } from '@/types/app';
import type { UserType } from '@fastgpt/global/support/user/type';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';

// module dispatch props type
export type ModuleDispatchProps<T> = {
  res: NextApiResponse;
  teamId: string;
  tmbId: string;
  user: UserType;
  appId: string;
  chatId?: string;
  stream: boolean;
  detail: boolean; // response detail
  variables: Record<string, any>;
  outputs: RunningModuleItemType['outputs'];
  inputs: T;
};
