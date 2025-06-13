import type {
  ChatCompletionMessageParam,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type {
  ModuleDispatchProps,
  DispatchNodeResponseType
} from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { DispatchFlowResponse } from '../../type.d';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { ChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model';
import type { JSONSchemaInputType } from '@fastgpt/global/core/app/jsonschema';

export type DispatchToolModuleProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.history]?: ChatItemType[];
  [NodeInputKeyEnum.userChatInput]: string;

  [NodeInputKeyEnum.fileUrlList]?: string[];
  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.aiSystemPrompt]: string;
  [NodeInputKeyEnum.aiChatTemperature]: number;
  [NodeInputKeyEnum.aiChatMaxToken]: number;
  [NodeInputKeyEnum.aiChatVision]?: boolean;
  [NodeInputKeyEnum.aiChatReasoning]?: boolean;
  [NodeInputKeyEnum.aiChatTopP]?: number;
  [NodeInputKeyEnum.aiChatStopSign]?: string;
  [NodeInputKeyEnum.aiChatResponseFormat]?: string;
  [NodeInputKeyEnum.aiChatJsonSchema]?: string;
}> & {
  messages: ChatCompletionMessageParam[];
  toolNodes: ToolNodeItemType[];
  toolModel: LLMModelItemType;
  interactiveEntryToolParams?: WorkflowInteractiveResponseType['toolParams'];
};

export type RunToolResponse = {
  dispatchFlowResponse: DispatchFlowResponse[];
  toolNodeInputTokens: number;
  toolNodeOutputTokens: number;
  completeMessages?: ChatCompletionMessageParam[];
  assistantResponses?: AIChatItemValueItemType[];
  toolWorkflowInteractiveResponse?: WorkflowInteractiveResponseType;
  [DispatchNodeResponseKeyEnum.runTimes]: number;
  finish_reason?: CompletionFinishReason;
};
export type ToolNodeItemType = RuntimeNodeItemType & {
  toolParams: RuntimeNodeItemType['inputs'];
  jsonSchema?: JSONSchemaInputType;
};
