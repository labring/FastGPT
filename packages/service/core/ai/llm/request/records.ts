import type {
  ChatCompletionCreateParams,
  ChatCompletionMessageToolCall,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import { isDevEnv } from '@fastgpt/global/common/system/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { saveLLMRequestRecord } from '../../record/controller';
import type { LLMAccumulatedUsage } from './types';

/**
 * 保存成功拿到模型响应后的请求详情。
 *
 * 注意：usedUserOpenAIKey 只用于本次调用返回给上层做计费判断，
 * 不写入详情，避免把计费分支信息混入模型响应快照。
 */
export const saveLLMResponseRecord = ({
  requestId,
  requestBody,
  answerText,
  reasoningText,
  toolCalls,
  finishReason,
  usage,
  inputTokens,
  outputTokens,
  error
}: {
  requestId: string;
  requestBody: ChatCompletionCreateParams;
  answerText: string;
  reasoningText: string;
  toolCalls?: ChatCompletionMessageToolCall[];
  finishReason: CompletionFinishReason;
  usage: LLMAccumulatedUsage;
  inputTokens: number;
  outputTokens: number;
  error?: any;
}) => {
  void saveLLMRequestRecord({
    requestId,
    body: requestBody,
    response: {
      ...(answerText && { answerText }),
      ...(reasoningText && { reasoningText }),
      ...(toolCalls?.length && { toolCalls }),
      finish_reason: finishReason,
      usage: {
        inputTokens,
        outputTokens,
        // 缓存 token 目前只在开发环境展示，线上详情保持精简。
        ...(isDevEnv
          ? {
              cachedTokens: usage.cached_tokens,
              cacheReadTokens: usage.cache_read_tokens,
              cacheWriteTokens: usage.cache_write_tokens
            }
          : {})
      },
      error
    }
  });
};

/**
 * 保存请求链路抛错时的详情。
 *
 * 这里不记录 usage：失败请求不应参与用量累加，且底层错误通常没有可信 token 信息。
 */
export const saveLLMErrorRecord = ({
  requestId,
  requestBody,
  error
}: {
  requestId: string;
  requestBody: ChatCompletionCreateParams;
  error: any;
}) => {
  void saveLLMRequestRecord({
    requestId,
    body: requestBody,
    response: {
      error: getErrText(error)
    }
  });
};
