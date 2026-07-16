import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';

export type BuildAgentLoopCoreRequestMessagesParams = {
  messages: ChatItemMiniType[];
  removeSystemMessages?: boolean;
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
