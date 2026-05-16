import type { ChatCompletionMessageToolCall } from '@fastgpt/global/core/ai/llm/type';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { sliceStrStartEnd } from '@fastgpt/global/common/string/tools';
import type { WorkflowResponseType } from '../../../type';
import type { ToolInfo } from './useToolCatalog';

export const useToolStreamResponse = ({
  workflowStreamResponse,
  isResponseAnswerText,
  aiChatReasoning,
  getToolInfo
}: {
  workflowStreamResponse?: WorkflowResponseType;
  isResponseAnswerText?: boolean;
  aiChatReasoning?: boolean;
  getToolInfo: (name: string) => ToolInfo | undefined;
}) => {
  const streamReasoning = (text: string) => {
    if (!aiChatReasoning) return;
    workflowStreamResponse?.({
      event: SseResponseEventEnum.answer,
      data: textAdaptGptResponse({
        reasoning_content: text
      })
    });
  };

  const streamAnswer = (text: string) => {
    if (!isResponseAnswerText) return;
    workflowStreamResponse?.({
      event: SseResponseEventEnum.answer,
      data: textAdaptGptResponse({
        text
      })
    });
  };

  const streamToolCall = (call: ChatCompletionMessageToolCall) => {
    if (!isResponseAnswerText) return;
    const toolNode = getToolInfo(call.function.name);
    if (!toolNode) return;

    workflowStreamResponse?.({
      id: call.id,
      event: SseResponseEventEnum.toolCall,
      data: {
        tool: {
          id: call.id,
          toolName: toolNode.name,
          toolAvatar: toolNode.avatar,
          functionName: call.function.name,
          params: call.function.arguments ?? ''
        }
      }
    });
  };

  const streamToolParams = ({
    call,
    argsDelta
  }: {
    call: ChatCompletionMessageToolCall;
    argsDelta: string;
  }) => {
    if (!isResponseAnswerText) return;
    workflowStreamResponse?.({
      id: call.id,
      event: SseResponseEventEnum.toolParams,
      data: {
        tool: {
          id: call.id,
          toolName: '',
          toolAvatar: '',
          params: argsDelta
        }
      }
    });
  };

  const streamToolResponse = ({
    toolCallId,
    response
  }: {
    toolCallId: string;
    response?: string;
  }) => {
    if (!isResponseAnswerText) return;

    /**
     * SSE 只给聊天气泡做轻量预览；完整工具响应与压缩 child 保存在 nodeResponse。
     */
    workflowStreamResponse?.({
      id: toolCallId,
      event: SseResponseEventEnum.toolResponse,
      data: {
        tool: {
          id: toolCallId,
          toolName: '',
          toolAvatar: '',
          params: '',
          response: sliceStrStartEnd(response || '', 5000, 5000)
        }
      }
    });
  };

  return {
    streamReasoning,
    streamAnswer,
    streamToolCall,
    streamToolParams,
    streamToolResponse
  };
};
