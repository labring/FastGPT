import type { NextApiResponse } from 'next';
import { RunningModuleItemType } from '../app';
import { UserModelSchema } from '../mongoSchema';

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
