import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { DispatchFlowResponse } from '../../type';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import type { ToolCallChildrenInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import type { JSONSchemaInputType } from '@fastgpt/global/core/app/jsonschema';
import type { ReasoningEffort } from '@fastgpt/global/core/ai/llm/type';

export type DispatchToolModuleProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.history]?: ChatItemMiniType[];
  [NodeInputKeyEnum.userChatInput]: string;

  [NodeInputKeyEnum.fileUrlList]?: string[];
  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.aiSystemPrompt]: string;
  [NodeInputKeyEnum.aiChatTemperature]: number;
  [NodeInputKeyEnum.aiChatMaxToken]: number;
  [NodeInputKeyEnum.aiChatIsResponseText]?: boolean;
  [NodeInputKeyEnum.aiChatVision]?: boolean;
  [NodeInputKeyEnum.aiChatReasoning]?: boolean;
  [NodeInputKeyEnum.aiChatReasoningEffort]?: ReasoningEffort;
  [NodeInputKeyEnum.aiChatTopP]?: number;
  [NodeInputKeyEnum.aiChatStopSign]?: string;
  [NodeInputKeyEnum.aiChatResponseFormat]?: string;
  [NodeInputKeyEnum.aiChatJsonSchema]?: string;
  [NodeInputKeyEnum.useAgentSandbox]?: boolean;
}> & {
  messages: ChatCompletionMessageParam[];
  toolNodes: ToolNodeItemType[];
  toolModel: LLMModelItemType;
  childrenInteractiveParams?: ToolCallChildrenInteractive['params'];
  allFiles: Map<string, FileInputType>;
  currentInputFiles: FileInputType[];
};

export type ToolNodeItemType = {
  nodeId: RuntimeNodeItemType['nodeId'];
  name: RuntimeNodeItemType['name'];
  avatar?: RuntimeNodeItemType['avatar'];
  intro?: RuntimeNodeItemType['intro'];
  toolDescription?: RuntimeNodeItemType['toolDescription'];
  flowNodeType: RuntimeNodeItemType['flowNodeType'];

  jsonSchema?: JSONSchemaInputType;
  toolParams: RuntimeNodeItemType['inputs'];
};

export type ChildResponseItemType = {
  flowResponses: DispatchFlowResponse['flowResponses'];
  runTimes: DispatchFlowResponse['runTimes'];
  flowUsages: DispatchFlowResponse['flowUsages'];
};

export type FileInputType = {
  id: string;
  name: string;
  url: string;
  sandboxPath?: string;
};
