import type { ChatCompletionMessageToolCall } from '@fastgpt/global/core/ai/llm/type';

export type ToolCallEventType = {
  onToolCall?: (e: { call: ChatCompletionMessageToolCall }) => void;
  onToolParam?: (e: { call: ChatCompletionMessageToolCall; argsDelta: string }) => void;
  // 工具执行完成后的生命周期钩子（含未找到 / parseParams 失败 / execute 抛错的兜底）
  onAfterToolCall?: (e: {
    success: boolean;
    call: ChatCompletionMessageToolCall;
    response?: string;
    errorMessage?: string;
  }) => void;

  // 工具压缩后回调
  onAfterToolResponseCompress?: (e: {
    call: ChatCompletionMessageToolCall;
    response: string;
    usage: {
      inputTokens: number;
      outputTokens: number;
      totalPoints: number;
    };
  }) => void;
};
