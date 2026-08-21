import type { ChatCompletionMessageToolCall } from '@fastgpt/global/core/ai/llm/type';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';

export type ToolCallEventType = {
  onToolCall?: (e: { call: ChatCompletionMessageToolCall }) => void;
  onToolParam?: (e: { call: ChatCompletionMessageToolCall; argsDelta: string }) => void;
  onToolRunStart?: (e: { call: ChatCompletionMessageToolCall }) => void;
  onToolRunEnd?: (e: {
    call: ChatCompletionMessageToolCall;
    rawResponse: string;
    response: string;
    errorMessage?: string;
    seconds: number;
    usages?: ChatNodeUsageType[];
    nodeResponse?: ChatHistoryItemResType;
    toolResponseCompress?: {
      response: string;
      usage: ChatNodeUsageType;
      requestIds: string[];
      seconds: number;
    };
  }) => void;
};
