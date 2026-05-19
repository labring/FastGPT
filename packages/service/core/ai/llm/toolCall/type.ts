import type { ChatCompletionMessageToolCall } from '@fastgpt/global/core/ai/llm/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';

export type ToolCallEventType = {
  onToolCall?: (e: { call: ChatCompletionMessageToolCall }) => void;
  onToolParam?: (e: { call: ChatCompletionMessageToolCall; argsDelta: string }) => void;
  // 工具执行完成后的生命周期钩子（含未找到 / parseParams 失败 / execute 抛错的兜底）
  onAfterToolCall?: (e: {
    call: ChatCompletionMessageToolCall;
    response?: string;
    errorMessage?: string;
    seconds: number;
    toolResponseCompress?: {
      response: string;
      usage: ChatNodeUsageType;
      requestIds: string[];
      seconds: number;
    };
  }) => void;
};
