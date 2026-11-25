import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import { getUsedCacheTokens } from '@fastgpt/global/support/wallet/usage/tools';

export type CreateAgentLoopCoreToolCallNodeResponseParams = {
  totalPoints: number;
  toolCallInputTokens: number;
  toolCallOutputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  modelName: string;
  query: string;
  completeMessages: ChatCompletionMessageParam[];
  useVision?: boolean;
  finishReason: string;
  requestIds: string[];
  firstTokenTime?: number;
};

/**
 * 组装 ToolCall 节点的顶层 nodeResponse。
 *
 * 这是 workflow adapter 层展示结构，不属于底层 agent-loop result；放在 core 中是为了让
 * ToolCall 外壳不再直接理解 completeMessages 预览和 token/points 汇总字段。
 * 子工具详情由响应 Context 独立发布，不再内嵌到顶层响应。
 */
export const createAgentLoopCoreToolCallNodeResponse = ({
  totalPoints,
  toolCallInputTokens,
  toolCallOutputTokens,
  cacheReadTokens,
  cacheCreationTokens,
  modelName,
  query,
  completeMessages,
  useVision,
  finishReason,
  requestIds,
  firstTokenTime
}: CreateAgentLoopCoreToolCallNodeResponseParams): Record<string, unknown> => {
  const usedCacheReadTokens = getUsedCacheTokens(cacheReadTokens);
  const usedCacheCreationTokens = getUsedCacheTokens(cacheCreationTokens);

  return {
    totalPoints,
    toolCallInputTokens,
    toolCallOutputTokens,
    ...(usedCacheReadTokens !== undefined ? { cacheReadTokens: usedCacheReadTokens } : {}),
    ...(usedCacheCreationTokens !== undefined
      ? { cacheCreationTokens: usedCacheCreationTokens }
      : {}),
    model: modelName,
    query,
    historyPreview: getHistoryPreview(
      GPTMessages2Chats({ messages: completeMessages, reserveTool: false }),
      10000,
      useVision
    ),
    finishReason,
    llmRequestIds: requestIds,
    firstTokenTime
  };
};
