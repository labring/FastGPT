import type {
  ChatCompletionMessageToolCall,
  CompletionFinishReason,
  LLMCompletionUsage,
  StreamResponseType,
  UnStreamResponseType
} from '@fastgpt/global/core/ai/llm/type';
import type { BlockedToolCallReason } from '../types';

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

/**
 * FastGPT 仅按 OpenAI 兼容的 Chat Completions usage 约定解析缓存用量，普通请求与 Pi SDK 口径一致。
 * 供应商协议和用量字段由 AIProxy 渠道适配层转换。旧 requestUrl 直连端点需按同一约定返回用量。
 * cached_tokens 表示缓存读取，AIProxy 输出的 cache_write_tokens 表示缓存创建。
 * 两个明细创建别名按 AIProxy 规则取较大值，只记录一次创建量。
 * 缓存读取和创建均包含在总输入内，异常值也不得超过总输入。
 */
export const normalizeLLMCacheUsage = (usage: LLMCompletionUsage) => {
  const safeCount = (value?: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
  const details = usage.prompt_tokens_details;
  const inputTokens = safeCount(usage.prompt_tokens);
  const cacheCreationTokens = Math.min(
    inputTokens,
    safeCount(
      usage.cache_creation_tokens ??
        Math.max(safeCount(details?.cache_creation_tokens), safeCount(details?.cache_write_tokens))
    )
  );
  const cacheReadTokens = Math.min(
    inputTokens - cacheCreationTokens,
    safeCount(details?.cache_read_tokens ?? usage.prompt_cache_hit_tokens ?? details?.cached_tokens)
  );
  return { cacheReadTokens, cacheCreationTokens };
};

/**
 * 判断 tool call 的 arguments 是否是合法的 JSON 对象字符串（顶层须为普通对象 `{...}`）。
 * 数组、字符串、数字、布尔值、null 等非对象 JSON 会被部分上游（如 DashScope/Qwen）以 400 拒绝。
 */
export const isValidToolArguments = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
};

const withEmptyObjectArguments = (
  call: ChatCompletionMessageToolCall
): ChatCompletionMessageToolCall =>
  call.function.arguments === '{}'
    ? call
    : {
        ...call,
        function: {
          ...call.function,
          arguments: '{}'
        }
      };

/** 响应已终止或出错时，未完成的工具调用整组丢弃、不得执行或进入下游上下文。 */
export const isTerminatedFinishReason = (finishReason: CompletionFinishReason): boolean =>
  finishReason === 'close' || finishReason === 'error' || finishReason === 'content_filter';

/** 将指定 ID 集合对应的工具参数脱敏为 '{}'，保留其余调用原样。 */
export const redactToolCalls = (
  toolCalls: ChatCompletionMessageToolCall[] | undefined,
  ids: ReadonlySet<string>
): ChatCompletionMessageToolCall[] | undefined => {
  if (!toolCalls?.length || ids.size === 0) return toolCalls;
  return toolCalls.map((call) => (ids.has(call.id) ? withEmptyObjectArguments(call) : call));
};

/**
 * 按最终 finish_reason 对模型返回的 toolCalls 做协议收敛与执行控制标记：
 * - close / error / content_filter：整组丢弃，绝不执行也不进入下游上下文；
 * - length：整组参数改写为 '{}' 并标为 'length'（审核拦截保留 'moderation'），跳过执行、回填截断提示；
 * - abnormal_close：逐条判断，合法对象/空串保留，残缺/非对象直接丢弃；
 * - tool_calls / function_call / stop：合法对象/空串正常保留，残缺/非对象改写为 '{}' 并标为 'invalid_args'，
 *   跳过执行并回填格式错误文案供模型下轮自修正。
 */
export const reconcileFinalToolCalls = ({
  toolCalls,
  finishReason,
  moderatedToolCallIds
}: {
  toolCalls?: ChatCompletionMessageToolCall[];
  finishReason: CompletionFinishReason;
  moderatedToolCallIds?: ReadonlySet<string>;
}): {
  toolCalls?: ChatCompletionMessageToolCall[];
  blockedToolCalls: Record<string, BlockedToolCallReason>;
} => {
  if (!toolCalls?.length) {
    return { toolCalls, blockedToolCalls: {} };
  }

  if (isTerminatedFinishReason(finishReason)) {
    return { toolCalls: [], blockedToolCalls: {} };
  }

  const blockedToolCalls: Record<string, BlockedToolCallReason> = {};

  if (finishReason === 'length') {
    return {
      toolCalls: toolCalls.map((call) => {
        blockedToolCalls[call.id] = moderatedToolCallIds?.has(call.id) ? 'moderation' : 'length';
        return withEmptyObjectArguments(call);
      }),
      blockedToolCalls
    };
  }

  const dropInvalid = finishReason === 'abnormal_close';
  const reconciledCalls = toolCalls.flatMap((call) => {
    if (moderatedToolCallIds?.has(call.id)) {
      blockedToolCalls[call.id] = 'moderation';
      return [withEmptyObjectArguments(call)];
    }

    const rawArgs = call.function?.arguments ?? '';
    if (rawArgs.trim() === '') return [withEmptyObjectArguments(call)];
    if (isValidToolArguments(rawArgs)) return [call];

    // abnormal_close 下的残缺/非对象参数属于中途断流直接丢弃；正常结束则改 '{}' 并标 invalid_args 供下轮自修正。
    if (dropInvalid) return [];
    blockedToolCalls[call.id] = 'invalid_args';
    return [withEmptyObjectArguments(call)];
  });

  return { toolCalls: reconciledCalls, blockedToolCalls };
};
