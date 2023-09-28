import type { ChatCompletionRequestMessage } from '@fastgpt/core/aiApi/type';
import type { NextApiResponse } from 'next';
import { RunningModuleItemType } from '@/types/app';
import { UserModelSchema } from '@/types/mongoSchema';

export type MessageItemType = ChatCompletionRequestMessage & { dataId?: string };

// module dispatch props type
export type ModuleDispatchProps<T> = {
  res: NextApiResponse;
  moduleName: string;
  stream: boolean;
  detail: boolean;
  variables: Record<string, any>;
  outputs: RunningModuleItemType['outputs'];
  userOpenaiAccount?: UserModelSchema['openaiAccount'];
  inputs: T;
};
