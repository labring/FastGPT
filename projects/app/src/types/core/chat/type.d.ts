import type { NextApiResponse } from 'next';
import { RunningModuleItemType } from '@/types/app';
import type { UserType } from '@fastgpt/global/support/user/type';

// module dispatch props type
export type ModuleDispatchProps<T> = {
  res: NextApiResponse;
  appId: string;
  chatId?: string;
  stream: boolean;
  detail: boolean;
  variables: Record<string, any>;
  outputs: RunningModuleItemType['outputs'];
  user: UserType;
  teamId: string;
  tmbId: string;
  inputs: T;
};
