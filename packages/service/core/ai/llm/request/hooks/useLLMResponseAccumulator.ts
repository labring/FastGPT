import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import { isDevEnv } from '@fastgpt/global/common/system/constants';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { CompleteResponse, LLMAccumulatedUsage } from '../types';

const createEmptyUsage = (): LLMAccumulatedUsage => ({
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
  cached_tokens: 0,
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
  let finishReason: CompletionFinishReason = 'stop';
  let error: any = undefined;
  let isStreamResponse = false;
  let hasResponseType = false;
  const usage = createEmptyUsage();

  /**
   * 统一构造模型协议消息，供工具续轮、历史持久化和长度续写复用。
   * 思考模型可以直接调用工具而不输出思考文本；此时空字符串仍是协议字段，不能按 truthy 丢弃。
   */
  const getAssistantMessage = (): ChatCompletionMessageParam => ({
    role: ChatCompletionRequestMessageRoleEnum.Assistant,
    ...(answerText && { content: answerText }),
    ...((supportReason || reasoningText) && { reasoning_content: reasoningText }),
    ...(toolCalls?.length && { tool_calls: toolCalls })
  });

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
     */
    appendResponse(response: CompleteResponse) {
      answerText += response.answerText;
      reasoningText += response.reasoningText;
      const formatToolCalls = response.toolCalls?.map((tool) => ({
        ...tool,
        function: {
          ...tool.function,
          arguments: tool.function.arguments || '{}'
        }
      }));

      if (formatToolCalls?.length) {
        toolCalls = [...(toolCalls || []), ...formatToolCalls];
      }
      // 后一轮 finish reason 代表最终状态；中间 length 只用于决定是否继续。
      finishReason = response.finish_reason;
      error = response.error;

      if (response.usage) {
        // 多轮连续输出需要合并成一次调用的总消耗。
        usage.prompt_tokens += response.usage.prompt_tokens || 0;
        usage.completion_tokens += response.usage.completion_tokens || 0;
        usage.total_tokens += response.usage.total_tokens || 0;
        if (isDevEnv) {
          const cachedTokens = response.usage.prompt_tokens_details?.cached_tokens || 0;
          usage.cached_tokens += cachedTokens;
          usage.cache_read_tokens += cachedTokens;
        }
      }
    },

    /**
     * 只有已产生正文、因长度截断且没有错误时才继续请求。
     * 工具调用必须先由上层执行并追加结果，不能直接跟随“继续输出”的 user 消息。
     * 尚未产生正文的思考也不能独立构成下一轮 assistant 消息。
     */
    shouldContinue() {
      return finishReason === 'length' && !error && !toolCalls?.length && !!answerText;
    },

    /**
     * 输出截断后补一轮“继续输出”请求，只保留原始上下文并追加已生成的 assistant 内容。
     */
    buildContinuationMessages({
      baseMessages
    }: {
      baseMessages: ChatCompletionMessageParam[];
    }): ChatCompletionMessageParam[] {
      return [
        ...baseMessages,
        getAssistantMessage(),
        {
          role: ChatCompletionRequestMessageRoleEnum.User as 'user',
          content: '[继续输出]'
        }
      ];
    },

    /**
     * 返回聚合结果，由入口判断异常结束、补 token 并保存详情。
     */
    getResponse() {
      return {
        assistantMessage: getAssistantMessage(),
        answerText,
        reasoningText,
        toolCalls,
        finish_reason: finishReason,
        usage,
        error,
        isStreamResponse
      };
    }
  };
};
