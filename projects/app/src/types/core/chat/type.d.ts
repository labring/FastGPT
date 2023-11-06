import type { ChatCompletionRequestMessage } from '@fastgpt/global/core/ai/type.d';
import type { NextApiResponse } from 'next';
import { RunningModuleItemType } from '@/types/app';
import type { UserType } from '@fastgpt/global/support/user/type';

export type MessageItemType = ChatCompletionRequestMessage & { dataId?: string; content: string };

// module dispatch props type
export type ModuleDispatchProps<T> = {
  res: NextApiResponse;
  stream: boolean;
  detail: boolean;
  variables: Record<string, any>;
  outputs: RunningModuleItemType['outputs'];
  user: UserType;
  teamId: string;
  tmbId: string;
  inputs: T;
};
