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
  const convertMessages = (
    messagesToConvert: BuildAgentLoopCoreAssistantResponsesFromMessagesParams['messages']
  ) =>
    GPTMessages2Chats({
      messages: messagesToConvert,
      reserveTool,
      reserveReason,
      getToolInfo
    })
      .map((item) => item.value as AIChatItemValueItemType[])
      .flat();

  if (!reserveTool) return convertMessages(messages);

  const pairedToolCallIds = new Set(
    messages.flatMap((message) =>
      message.role === ChatCompletionRequestMessageRoleEnum.Assistant && message.tool_calls
        ? message.tool_calls.map((toolCall) => toolCall.id)
        : []
    )
  );

  const responses: AIChatItemValueItemType[] = [];
  let chunkStart = 0;

  messages.forEach((message, index) => {
    const isStandaloneToolResponse =
      message.role === ChatCompletionRequestMessageRoleEnum.Tool &&
      !pairedToolCallIds.has(message.tool_call_id);

    if (!isStandaloneToolResponse) return;

    // 未配对的 tool message 可能来自子工作流 transcript。它仍然需要保留，
    // 但必须插回原始消息位置，不能统一追加到所有 assistant 文本之后。
    responses.push(...convertMessages(messages.slice(chunkStart, index)));
    responses.push({
      tools: [
        {
          id: message.tool_call_id,
          toolName: '',
          toolAvatar: '',
          functionName: '',
          params: '',
          response:
            typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
        }
      ]
    });
    chunkStart = index + 1;
  });

  responses.push(...convertMessages(messages.slice(chunkStart)));
  return responses;
};
