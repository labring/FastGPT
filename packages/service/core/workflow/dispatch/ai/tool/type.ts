import type {
  ChatCompletionMessageParam,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { DispatchFlowResponse } from '../../type';
import type { AIChatItemValueItemType, ChatItemType } from '@fastgpt/global/core/chat/type';
import type { ToolCallChildrenInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
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
  childrenInteractiveParams?: ToolCallChildrenInteractive['params'];
};

export type RunToolResponse = {
  toolDispatchFlowResponses: DispatchFlowResponse[];
  toolCallInputTokens: number;
  toolCallOutputTokens: number;
  completeMessages: ChatCompletionMessageParam[];
  assistantResponses: AIChatItemValueItemType[];
  finish_reason: CompletionFinishReason;
  toolWorkflowInteractiveResponse?: ToolCallChildrenInteractive;
};
export type ToolNodeItemType = RuntimeNodeItemType & {
  toolParams: RuntimeNodeItemType['inputs'];
  jsonSchema?: JSONSchemaInputType;
};
