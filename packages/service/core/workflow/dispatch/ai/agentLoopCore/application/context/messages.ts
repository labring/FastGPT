import { chats2GPTMessages, filterToolMessages } from '@fastgpt/global/core/chat/adapt';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import type { AgentLoopRuntime } from '../../../../../../ai/llm/agentLoop/domain/runtime';
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
};

/** 节点以已组装的 runtime 工具目录一次性过滤继承历史。 */
export const filterAgentLoopCoreHistoryTools = (
  messages: ChatCompletionMessageParam[],
  { toolCatalog, systemTools }: Pick<AgentLoopRuntime, 'toolCatalog' | 'systemTools'>
): ChatCompletionMessageParam[] => {
  const allowedToolNames = new Set(toolCatalog.runtimeTools.map((tool) => tool.function.name));

  if (systemTools?.plan?.enabled) {
    allowedToolNames.add(setPlanToolName);
    allowedToolNames.add(updatePlanToolName);
  }
  if (systemTools?.ask?.enabled) {
    allowedToolNames.add(askUserToolName);
  }
  if (systemTools?.sandbox?.enabled) {
    getAgentLoopSandboxToolNames().forEach((name) => allowedToolNames.add(name));
  }
  if (systemTools?.readFile?.enabled) {
    allowedToolNames.add(READ_FILES_TOOL_NAME);
  }
  if (systemTools?.datasetSearch?.enabled) {
    allowedToolNames.add(DATASET_SEARCH_TOOL_NAME);
  }

  return filterToolMessages(messages, (name) => allowedToolNames.has(name));
};

/**
 * 将 workflow chat items 转成 agent-loop 请求 messages。
 *
 * Workflow Agent 和 ToolCall 都需要保留 tool_call/tool_response 来恢复多轮工具上下文；
 * 历史里的 system message 默认过滤，由节点外壳通过 systemPrompt 单独注入，避免重复系统提示。
 */
export const buildAgentLoopCoreRequestMessages = ({
  messages,
  removeSystemMessages = true
}: BuildAgentLoopCoreRequestMessagesParams): ChatCompletionMessageParam[] => {
  const requestMessages = chats2GPTMessages({
    messages,
    reserveId: false,
    reserveTool: true
  });

  return removeSystemMessages
    ? requestMessages.filter((message) => message.role !== 'system')
    : requestMessages;
};
