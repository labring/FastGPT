import type {
  ChatCompletionMessageToolCall,
  CompletionFinishReason,
  StreamResponseType,
  UnStreamResponseType
} from '@fastgpt/global/core/ai/llm/type';
import type { CompleteResponse } from '../types';

/** 工具协议异常具有固定 code，诊断信息通过 cause 保留原始调用和冲突 delta。 */
export class LLMToolCallError extends Error {
  readonly code = 'LLM_TOOL_CALL_ERROR';

  constructor({ message, cause }: { message: string; cause: unknown }) {
    super(message, { cause });
    this.name = 'LLMToolCallError';
  }
}

/** 兼容供应商添加的字面量 functions. 前缀，不改变 functions_search 等合法名称。 */
export const normalizeToolName = (name: string) => name.replace(/^functions\./, '');

/**
 * stream 和非 stream 共用的原生工具校验；必须在非 stream 派发工具回调前执行。
 * 保留上游错误，过滤未声明工具；明确以 tool_calls 结束却没有有效调用时返回协议错误。
 */
export const normalizeNativeToolCalls = ({
  toolCalls,
  toolNames,
  finish_reason,
  error,
  protocolError
}: {
  toolCalls: (ChatCompletionMessageToolCall & { index?: number; upstreamId?: string })[];
  toolNames: Set<string>;
  finish_reason: CompletionFinishReason;
  error?: unknown;
  protocolError?: { message: string; toolCall: unknown };
}): Pick<CompleteResponse, 'toolCalls' | 'finish_reason' | 'error'> => {
  const normalizedCalls = toolCalls
    .map<ChatCompletionMessageToolCall>((call) => ({
      id: call.id,
      type: 'function',
      function: {
        name: normalizeToolName(call.function.name),
        arguments: call.function.arguments.trim() === '' ? '{}' : call.function.arguments
      }
    }))
    .filter((call) => toolNames.has(call.function.name));

  if (error || (!protocolError && (finish_reason !== 'tool_calls' || normalizedCalls.length > 0))) {
    return { toolCalls: normalizedCalls, finish_reason, error };
  }

  return {
    toolCalls: protocolError ? [] : normalizedCalls,
    finish_reason: 'error',
    error: new LLMToolCallError({
      message:
        protocolError?.message ??
        'LLM tool call error: finish_reason=tool_calls but no valid tool calls matched the requested tools.',
      cause: {
        finish_reason,
        expectedToolNames: [...toolNames],
        receivedToolCalls: toolCalls,
        ...(protocolError && { conflictingToolCall: protocolError.toolCall })
      }
    })
  };
};

/**
 * 补齐模型响应的 finish_reason。
 *
 * stream 场景下，如果已经收到部分内容但没有正常结束标记，记录为 abnormal_close；
 * 非 stream 场景一般是完整响应，缺失 finish_reason 时按 stop 处理。
 */
export const normalizeCompletionFinishReason = ({
  rawFinishReason,
  isStreamResponse,
  hasResponse,
  error
}: {
  rawFinishReason: CompletionFinishReason;
  isStreamResponse: boolean;
  hasResponse: boolean;
  error?: any;
}): CompletionFinishReason => {
  if (error) return 'error';
  if (rawFinishReason) return rawFinishReason;
  if (isStreamResponse && hasResponse) return 'abnormal_close';
  return 'stop';
};

/**
 * 判断 SDK 返回值是否为 stream。
 * 这里不用 instanceof，避免不同 SDK/运行时包装后原型不一致。
 */
export const isStreamCompletionResponse = (
  response: StreamResponseType | UnStreamResponseType
): response is StreamResponseType => {
  return (
    typeof response === 'object' &&
    response !== null &&
    ('iterator' in response || 'controller' in response)
  );
};
