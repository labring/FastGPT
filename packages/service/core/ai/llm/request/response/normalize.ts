import type {
  ChatCompletionMessageToolCall,
  CompletionFinishReason,
  StreamResponseType,
  UnStreamResponseType
} from '@fastgpt/global/core/ai/llm/type';

/** 兼容供应商添加的字面量 functions. 前缀，不改变 functions_search 等合法名称。 */
export const normalizeToolName = (name: string) => name.replace(/^functions\./, '');

/**
 * stream 和非 stream 共用的原生工具规范化：复制后统一名称、参数，过滤未声明工具。
 * 这里只转换工具，不修改结束原因或接口错误。
 */
export const normalizeNativeToolCalls = ({
  toolCalls,
  toolNames
}: {
  toolCalls: ChatCompletionMessageToolCall[];
  toolNames: Set<string>;
}): ChatCompletionMessageToolCall[] => {
  /**
   * 非 stream 工具调用直接来自供应商原始响应，name/arguments 可能缺失、为 null 或是对象。
   * 统一转成字符串，避免校验阶段直接崩溃；对象参数序列化后仍可作为工具入参使用。
   */
  const toToolCallText = (value: unknown) => {
    if (value === undefined || value === null) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  };

  return toolCalls
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
