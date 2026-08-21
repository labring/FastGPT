import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';

export type CreateAgentLoopCoreToolCallNodeResponseParams = {
  totalPoints: number;
  toolCallInputTokens: number;
  toolCallOutputTokens: number;
  toolTotalPoints: number;
  modelName: string;
  query: string;
  completeMessages: ChatCompletionMessageParam[];
  useVision?: boolean;
  toolDetail: ChatHistoryItemResType[];
  nodeId: string;
  finishReason: string;
  requestIds: string[];
};

/**
 * 组装 ToolCall 节点的顶层 nodeResponse。
 *
 * 这是 workflow adapter 层展示结构，不属于底层 agent-loop result；放在 core 中是为了让
 * ToolCall 外壳不再直接理解 completeMessages 预览、子工具详情和 token/points 汇总字段。
 */
export const createAgentLoopCoreToolCallNodeResponse = ({
  totalPoints,
  toolCallInputTokens,
  toolCallOutputTokens,
  toolTotalPoints,
  modelName,
  query,
  completeMessages,
  useVision,
  toolDetail,
  nodeId,
  finishReason,
  requestIds
}: CreateAgentLoopCoreToolCallNodeResponseParams): Record<string, unknown> => ({
  totalPoints,
  toolCallInputTokens,
  toolCallOutputTokens,
  childTotalPoints: toolTotalPoints,
  model: modelName,
  query,
  historyPreview: getHistoryPreview(
    GPTMessages2Chats({ messages: completeMessages, reserveTool: false }),
    10000,
    useVision
  ),
  toolDetail,
  mergeSignId: nodeId,
  finishReason,
  llmRequestIds: requestIds
});
