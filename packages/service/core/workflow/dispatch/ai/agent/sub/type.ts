import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import type { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { AgentPromptRef } from '@fastgpt/global/core/workflow/node/agent/promptRef/types';
import type { SubAppRuntimeType } from '../type';

export type SubAppPromptReferenceType = {
  name: string;
  ref: AgentPromptRef;
  legacyExactKeys?: string[];
};

export type SubAppInitType = {
  type: SubAppRuntimeType['type'];
  id: string;
  name: string;
  avatar?: string;
  version?: string;
  toolConfig?: RuntimeNodeItemType['toolConfig'];
  inputs: RuntimeNodeItemType['inputs'];
  agentGeneratedInputKeys: string[];
  requestSchema: ChatCompletionTool;
  childPromptReference?: SubAppPromptReferenceType;
  promptReference?: SubAppPromptReferenceType;
  params: {
    [NodeInputKeyEnum.systemInputConfig]?: {
      type: SystemToolSecretInputTypeEnum;
      value: StoreSecretValueType;
    };
    [key: string]: any;
  };
};
