import { chats2GPTMessages, filterToolMessages } from '@fastgpt/global/core/chat/adapt';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { askUserToolName } from '../../../../../../ai/llm/agentLoop/domain/systemTool/ask';
import { DATASET_SEARCH_TOOL_NAME } from '../../../../../../ai/llm/agentLoop/domain/systemTool/datasetSearch';
import { READ_FILES_TOOL_NAME } from '../../../../../../ai/llm/agentLoop/domain/systemTool/readFile';
import { getAgentLoopSandboxToolNames } from '../../../../../../ai/llm/agentLoop/domain/systemTool/sandbox';
import {
  setPlanToolName,
  updatePlanToolName
} from '../../../../../../ai/llm/agentLoop/domain/systemTool/plan';

export type BuildAgentLoopCoreRequestMessagesParams = {
  messages: ChatItemMiniType[];
  removeSystemMessages?: boolean;
  toolFilter?: (toolName: string) => boolean;
};

export type CreateAgentLoopCoreToolFilterParams = {
  toolNames?: Iterable<string>;
  planEnabled?: boolean;
  askEnabled?: boolean;
  sandboxEnabled?: boolean;
  readFileEnabled?: boolean;
  datasetSearchEnabled?: boolean;
};

/**
 * 按当前工作流节点的工具集合（业务工具 + 启用的系统内置工具）构建历史工具过滤器。
 */
export const createAgentLoopCoreToolFilter = ({
  toolNames = [],
  planEnabled = false,
  askEnabled = false,
  sandboxEnabled = false,
  readFileEnabled = false,
  datasetSearchEnabled = false
}: CreateAgentLoopCoreToolFilterParams): ((toolName: string) => boolean) => {
  const allowedToolNames = new Set<string>(toolNames);

  if (planEnabled) {
    allowedToolNames.add(setPlanToolName);
    allowedToolNames.add(updatePlanToolName);
  }
  if (askEnabled) {
    allowedToolNames.add(askUserToolName);
  }
  if (sandboxEnabled) {
    getAgentLoopSandboxToolNames().forEach((name) => allowedToolNames.add(name));
  }
  if (readFileEnabled) {
    allowedToolNames.add(READ_FILES_TOOL_NAME);
  }
  if (datasetSearchEnabled) {
    allowedToolNames.add(DATASET_SEARCH_TOOL_NAME);
  }

  return (toolName: string) => allowedToolNames.has(toolName);
};

/**
 * 将 workflow chat items 转成 agent-loop 请求 messages。
 *
 * Workflow Agent 和 ToolCall 都需要保留 tool_call/tool_response 来恢复多轮工具上下文；
 * 节点提供工具目录时，仅在这里过滤一次继承历史。
 * 历史里的 system message 默认过滤，由节点外壳通过 systemPrompt 单独注入，避免重复系统提示。
 */
export const buildAgentLoopCoreRequestMessages = ({
  messages,
  removeSystemMessages = true,
  toolFilter
}: BuildAgentLoopCoreRequestMessagesParams): ChatCompletionMessageParam[] => {
  const adaptedMessages = chats2GPTMessages({
    messages,
    reserveId: false,
    reserveTool: true
  });
  const requestMessages = toolFilter
    ? filterToolMessages(adaptedMessages, toolFilter)
    : adaptedMessages;

  return removeSystemMessages
    ? requestMessages.filter((message) => message.role !== 'system')
    : requestMessages;
};
