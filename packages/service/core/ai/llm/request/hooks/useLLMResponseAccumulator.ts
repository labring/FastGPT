import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { BlockedToolCallReason, CompleteResponse, LLMAccumulatedUsage } from '../types';
import { normalizeLLMCacheUsage } from '../response/normalize';

const createEmptyUsage = (): LLMAccumulatedUsage => ({
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0
});

/**
 * 管理一次 createLLMResponse 内部可能发生的多轮 LLM 响应。
 *
 * 当前只有 finish_reason=length 会触发连续输出补偿，因此这里负责：
 * - 拼接多轮文本/reasoning/tool_calls。
 * - 累加多轮 usage。
 * - 为下一轮补偿请求构造“继续输出”的上下文。
 */
export const useLLMResponseAccumulator = ({
  supportReason = false
}: { supportReason?: boolean } = {}) => {
  let answerText = '';
  let reasoningText = '';
  let toolCalls: ChatCompletionMessageToolCall[] | undefined;
  let rawToolCalls: ChatCompletionMessageToolCall[] | undefined;
  let errorRecordToolCalls: ChatCompletionMessageToolCall[] | undefined;
  const blockedToolCalls: Record<string, BlockedToolCallReason> = {};
  let finishReason: CompletionFinishReason = 'stop';
  let error: any = undefined;
  let isStreamResponse = false;
  let hasResponseType = false;
  const usage = createEmptyUsage();

  /**
   * 构造 assistant 协议消息；思考模型即使没有思考文本，也必须保留空字段。
   * 非空思考沿用原始内容，非思考模型不额外生成空字段。
   */
  const buildAssistantMessage = (
    overrideToolCalls: ChatCompletionMessageToolCall[] | undefined = toolCalls
  ): ChatCompletionAssistantMessageParam => ({
    role: ChatCompletionRequestMessageRoleEnum.Assistant,
    ...(answerText && { content: answerText }),
    ...((supportReason || reasoningText) && { reasoning_content: reasoningText }),
    ...(overrideToolCalls?.length && { tool_calls: overrideToolCalls })
  });

  const appendToolCalls = (
    current: ChatCompletionMessageToolCall[] | undefined,
    incoming: ChatCompletionMessageToolCall[] | undefined
  ): ChatCompletionMessageToolCall[] | undefined =>
    incoming?.length ? [...(current ?? []), ...incoming] : current;

  return {
    /**
     * 记录第一次 LLM 请求的响应形态，连续输出补偿请求不会改变本次返回的整体 stream 标记。
     */
    setFirstResponseType(currentIsStreamResponse: boolean) {
      if (hasResponseType) return;
      isStreamResponse = currentIsStreamResponse;
      hasResponseType = true;
    },

    /**
     * 合并一次底层 LLM 返回，包含文本、reasoning、工具调用、finish reason 和 usage。
     * - rawToolCalls：收敛/脱敏前的原始调用，仅用于缺失 usage 时的计费估算；
     * - errorRecordToolCalls：调用方已按当轮审核脱敏的排障调用，仅用于 error 请求追踪落库。
     */
    appendResponse(
      response: CompleteResponse & {
        rawToolCalls?: ChatCompletionMessageToolCall[];
        errorRecordToolCalls?: ChatCompletionMessageToolCall[];
      }
    ) {
      answerText += response.answerText;
      reasoningText += response.reasoningText;
      toolCalls = (() => {
        if (response.toolCalls === undefined) return toolCalls;
        const normalized = response.toolCalls.map((tool) => ({
          ...tool,
          function: {
            ...tool.function,
            arguments: tool.function.arguments || '{}'
          }
        }));
        return normalized.length ? [...(toolCalls ?? []), ...normalized] : (toolCalls ?? []);
      })();

      const incomingRawToolCalls = response.rawToolCalls ?? response.toolCalls;
      rawToolCalls = appendToolCalls(rawToolCalls, incomingRawToolCalls);
      errorRecordToolCalls = appendToolCalls(
        errorRecordToolCalls,
        response.errorRecordToolCalls ?? incomingRawToolCalls
      );

      for (const [id, reason] of Object.entries(response.blockedToolCalls ?? {})) {
        // 跨轮复用同 ID 时不降级已有的审核拦截标记。
        if (blockedToolCalls[id] !== 'moderation') {
          blockedToolCalls[id] = reason;
        }
      }

      // 后一轮 finish reason 代表最终状态；中间 length 只用于决定是否继续。
      finishReason = response.finish_reason;
      error = response.error;

      if (response.usage) {
        // 多轮连续输出需要合并成一次调用的总消耗。
        usage.prompt_tokens += response.usage.prompt_tokens || 0;
        usage.completion_tokens += response.usage.completion_tokens || 0;
        usage.total_tokens += response.usage.total_tokens || 0;
        const { cacheReadTokens, cacheCreationTokens } = normalizeLLMCacheUsage(response.usage);
        usage.cache_read_tokens += cacheReadTokens;
        usage.cache_write_tokens += cacheCreationTokens;
      }
    },

    /**
     * 只有模型明确因为长度截断且没有错误时才继续请求。
     */
    shouldContinue() {
      return finishReason === 'length' && !error;
    },

    /**
     * 输出截断后补一轮“继续输出”请求，只保留原始上下文并追加已生成的可回放正文（及关联思考）：
     * 省略无回执的 tool_calls；无正文（含仅有思考）时省略整条 assistant 避免触发上游 400。
     */
    buildContinuationMessages({
      baseMessages
    }: {
      baseMessages: ChatCompletionMessageParam[];
    }): ChatCompletionMessageParam[] {
      const continuationAssistant = answerText ? buildAssistantMessage([]) : undefined;
      return [
        ...baseMessages,
        ...(continuationAssistant ? [continuationAssistant] : []),
        {
          role: ChatCompletionRequestMessageRoleEnum.User as 'user',
          content: '[继续输出]'
        }
      ];
    },

    /**
     * 按最终收敛后的 toolCalls 构造统一的 assistant 协议消息，保持与续写路径同源。
     */
    buildAssistantMessage,

    /**
     * 返回聚合结果，由入口判断异常结束、补 token 并保存详情。
     */
    getResponse() {
      return {
        assistantMessage: buildAssistantMessage(),
        rawAssistantMessage: buildAssistantMessage(rawToolCalls),
        answerText,
        reasoningText,
        toolCalls,
        rawToolCalls,
        errorRecordToolCalls,
        blockedToolCalls: { ...blockedToolCalls },
        finish_reason: finishReason,
        usage,
        error,
        isStreamResponse
      };
    }
  };
};
