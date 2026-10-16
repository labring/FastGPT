import type {
  ChatCompletionMessageToolCall,
  CompletionFinishReason,
  StreamResponseType,
  UnStreamResponseType
} from '@fastgpt/global/core/ai/llm/type';
import type { CompleteResponse } from '../types';

type LLMToolCallErrorContext = {
  finish_reason: CompletionFinishReason;
  expectedToolNames: string[];
  receivedToolCalls: (ChatCompletionMessageToolCall & { index?: number; upstreamId?: string })[];
  reason?: string;
  conflictingToolCall?: unknown;
};

/** 无接口错误时的工具错误兜底；固定对外消息，原始输出和协议诊断通过 cause 保留。 */
export class LLMToolCallError extends Error {
  readonly code = 'LLM_TOOL_CALL_ERROR';
  declare readonly cause: LLMToolCallErrorContext;

  constructor(cause: LLMToolCallErrorContext) {
    super('LLM tool call error: no valid tool calls matched the requested tools.', { cause });
    this.name = 'LLMToolCallError';
  }
}

/** 兼容供应商添加的字面量 functions. 前缀，不改变 functions_search 等合法名称。 */
export const normalizeToolName = (name: string) => name.replace(/^functions\./, '');

/**
 * stream 和非 stream 共用的原生工具校验；必须在非 stream 派发工具回调前执行。
 * 接口错误优先于已知工具错误，原样保留其 message/code/cause；没有接口错误时才使用固定错误兜底。
 * 过滤未声明工具；明确以 tool_calls 结束却没有有效调用时返回协议错误。
 */
export const normalizeNativeToolCalls = ({
  toolCalls,
  toolNames,
  finish_reason,
  error,
  protocolError
}: {
  toolCalls: LLMToolCallErrorContext['receivedToolCalls'];
  toolNames: Set<string>;
  finish_reason: CompletionFinishReason;
  error?: unknown;
  protocolError?: { message: string; toolCall: unknown };
}): Pick<CompleteResponse, 'toolCalls' | 'finish_reason' | 'error'> => {
  /**
   * 非 stream 工具调用直接来自供应商原始响应，name/arguments 可能缺失、为 null 或是对象。
   * 统一转成字符串，避免校验阶段直接崩溃；对象参数序列化后仍可作为工具入参使用。
   */
  const toToolCallText = (value: unknown) => {
    if (value === undefined || value === null) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  };

  const normalizedCalls = toolCalls
    .map<ChatCompletionMessageToolCall>((call) => {
      const args = toToolCallText(call.function?.arguments);
      return {
        id: call.id,
        type: 'function',
        function: {
          name: normalizeToolName(toToolCallText(call.function?.name)),
          arguments: args.trim() === '' ? '{}' : args
        }
      };
    })
    .filter((call) => toolNames.has(call.function.name));

  // 接口错误优先；仅在没有接口错误且命中已知工具异常时生成兜底。
  if (
    !error &&
    (protocolError || (finish_reason === 'tool_calls' && normalizedCalls.length === 0))
  ) {
    return {
      toolCalls: [],
      finish_reason: 'error',
      error: new LLMToolCallError({
        finish_reason,
        expectedToolNames: [...toolNames],
        receivedToolCalls: toolCalls,
        ...(protocolError && {
          reason: protocolError.message,
          conflictingToolCall: protocolError.toolCall
        })
      })
    };
  }

  return { toolCalls: normalizedCalls, finish_reason, error };
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
