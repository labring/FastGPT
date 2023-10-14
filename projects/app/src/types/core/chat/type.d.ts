import type { ChatCompletionRequestMessage } from '@fastgpt/core/ai/type';
import type { NextApiResponse } from 'next';
import { RunningModuleItemType } from '@/types/app';
import type { UserModelSchema } from '@fastgpt/support/user/type.d';

export type MessageItemType = ChatCompletionRequestMessage & { dataId?: string; content: string };

// module dispatch props type
export type ModuleDispatchProps<T> = {
  res: NextApiResponse;
  moduleName: string;
  stream: boolean;
  detail: boolean;
  variables: Record<string, any>;
  outputs: RunningModuleItemType['outputs'];
  user: UserModelSchema;
  inputs: T;
};
