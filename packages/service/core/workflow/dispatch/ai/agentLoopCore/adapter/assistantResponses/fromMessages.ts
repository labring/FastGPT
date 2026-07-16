import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { BuildAgentLoopCoreAssistantResponsesFromMessagesParams } from './type';

/**
 * 将 agent-loop 返回的 assistantMessages transcript 转为 FastGPT assistantResponses。
 *
 * 这里只处理标准 LLM transcript：文本、reasoning、tool_call 和 tool response。
 * plan/ask/contextCheckpoint 等 agent-loop 元事件由对应事件 builder 追加，避免两类语义混在一起。
 */
export const buildAgentLoopCoreAssistantResponsesFromMessages = ({
  messages,
  reserveTool = true,
  reserveReason = true,
  getToolInfo
}: BuildAgentLoopCoreAssistantResponsesFromMessagesParams): AIChatItemValueItemType[] => {
  const responses = GPTMessages2Chats({
    messages,
    reserveTool,
    reserveReason,
    getToolInfo
  })
    .map((item) => item.value as AIChatItemValueItemType[])
    .flat();

  if (!reserveTool) return responses;

  const pairedToolCallIds = new Set(
    messages.flatMap((message) =>
      message.role === ChatCompletionRequestMessageRoleEnum.Assistant && message.tool_calls
        ? message.tool_calls.map((toolCall) => toolCall.id)
        : []
    )
  );

  const standaloneToolResponses = messages.flatMap<AIChatItemValueItemType>((message) => {
    if (
      message.role !== ChatCompletionRequestMessageRoleEnum.Tool ||
      pairedToolCallIds.has(message.tool_call_id)
    ) {
      return [];
    }

    return [
      {
        tools: [
          {
            id: message.tool_call_id,
            toolName: '',
            toolAvatar: '',
            functionName: '',
            params: '',
            response:
              typeof message.content === 'string'
                ? message.content
                : JSON.stringify(message.content)
          }
        ]
      }
    ];
  });

  return [...responses, ...standaloneToolResponses];
};
