import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeNodeResponseSummary } from '../../type';
import type { ChatHistoryItemResType, ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import type { JSONSchemaInputType } from '@fastgpt/global/core/app/jsonschema';
import type { ReasoningEffort } from '@fastgpt/global/core/ai/llm/type';
import type { AgentLoopChildrenInteractiveParams } from '../../../../ai/llm/agentLoop';
import type { WorkflowNodeResponseWriter } from '../../../../chat/nodeResponseStorage';

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
  [NodeInputKeyEnum.aiChatAudio]?: boolean;
  [NodeInputKeyEnum.aiChatVideo]?: boolean;
  [NodeInputKeyEnum.aiChatExtractFiles]?: boolean;
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
  childrenInteractiveParams?: AgentLoopChildrenInteractiveParams<WorkflowInteractiveResponseType>;
  allFiles: Map<string, FileInputType>;
  currentInputFiles: FileInputType[];
  fileUrls?: string[];
  /**
   * 工作流入口统一创建的 nodeResponse writer。ToolCall 内部会产生多个工具子流程详情，
   * 必须复用同一个 writer 及时写库，避免完整 nodeResponse 在 LLM loop 中长期驻留。
   */
  nodeResponseWriter?: WorkflowNodeResponseWriter;
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
  /**
   * ToolCall 运行期只保留 summary 做父节点统计和后续运行判断。
   * 工具详情由 child workflow 复用共享 writer 直接写库，ToolCall 不缓存/重写第一层响应。
   */
  runtimeNodeResponseSummary?: RuntimeNodeResponseSummary;
  /**
   * 仅内置工具使用。
   *
   * sandbox/file 不是 child workflow，不会天然复用 runWorkflow 的 writer 写库，因此它们需要
   * 在 afterToolCall 阶段把自己构造的单层 nodeResponse 写到 ToolCall 父节点下。
   * 普通 child workflow 工具禁止填充该字段，避免重新引入第一层响应缓存和重复写入。
   */
  builtinNodeResponses?: ChatHistoryItemResType[];
  runTimes?: number;
  /**
   * 子 workflow 完整返回时会携带 usage；fallback、空响应或局部工具结构可能没有。
   * ToolCall 只在本地折算 totalPoints，对外不再返回该数组。
   */
  flowUsages?: ChatNodeUsageType[];
};

export type ToolDispatchSummaryType = {
  /**
   * ToolCall 子流程的运行期摘要。完整 nodeResponse 由 writer 写库，这里只保留父节点统计、
   * 运行控制和费用展示需要的轻量字段。
   */
  runtimeNodeResponseSummary: RuntimeNodeResponseSummary;
  runTimes: number;
  toolTotalPoints: number;
};

export type FileInputType = {
  id: string;
  name: string;
  url: string;
  sandboxPath?: string;
};
