import { getErrText } from '@fastgpt/global/common/error/utils';
import type { UnStreamResponseType } from '@fastgpt/global/core/ai/llm/type';
import { getAIApi, getAiproxyScopeHeaders } from '../../config';
import { normalizeRelayNoChannelError } from '../../channel';
import { assertModelActive } from '../../model/cache';
import { getLogger, LogCategories } from '../../../../common/logger';
import { isStreamCompletionResponse } from './response/normalize';
import type { CreateChatCompletionProps, CreateChatCompletionResult } from './types';

const logger = getLogger(LogCategories.MODULE.AI.LLM);

/**
 * 执行一次真实的 chat.completions.create 请求。
 *
 * getAIApi 会根据 userKey 返回实际使用的 OpenAI 客户端和 requestMeta。
 * 当 requestMeta.usedUserOpenAIKey=true 时，说明请求已经走用户 key，
 * 直接直连用户配置的端点，不经过 aiproxy channel 路由。
 */
export const createChatCompletion = async ({
  modelData,
  body,
  userKey,
  timeout,
  options
}: CreateChatCompletionProps): Promise<CreateChatCompletionResult> => {
  const formatTimeout = timeout ? timeout : 600000;

  const { ai, requestMeta } = getAIApi({
    userKey,
    timeout: formatTimeout
  });

  try {
    // modelData is non-optional by type, but guard defensively — undefined must
    // surface a clear error, not a TypeError. Disabled models must never be
    // callable at runtime (F2-S3-TC06): deepest choke point, even if a future
    // call site forgets the guard, every LLM path that lands here is safe.
    if (!modelData) {
      return Promise.reject(`Chat completion model not found`);
    }
    assertModelActive(modelData);
    body.model = modelData.model;

    // 用户自有 key 直连用户配置的端点（默认 api.openai.com），不经过 aiproxy channel 路由（design §3.1）。
    logger.debug('Start create chat completion', { model: body.model });

    // 用户 key 请求由 getAIApi 内部完成 baseUrl/key 选择。
    const response = await ai.chat.completions.create(body, {
      ...options,
      headers: {
        ...options?.headers,
        // Relay scope is a security attribute (design §2.9) — it must win over any
        // caller-provided header (e.g. Aiproxy-Channel channel lock).
        ...getAiproxyScopeHeaders(modelData, requestMeta.baseUrl)
      }
    });

    // OpenAI SDK 的 stream 响应没有稳定的普通 JSON 结构，统一通过迭代器/controller 特征识别。
    if (isStreamCompletionResponse(response)) {
      return {
        response,
        isStreamResponse: true,
        requestMeta
      };
    }

    return {
      response: response as UnStreamResponseType,
      isStreamResponse: false,
      requestMeta
    };
  } catch (error) {
    if (requestMeta.usedUserOpenAIKey) {
      // 用户 key 错误需要转成面向用户的提示，避免直接暴露底层 SDK 错误结构。
      logger.warn('User AI API error', {
        baseUrl: requestMeta.baseUrl,
        request: body,
        error
      });
      return Promise.reject(`您的 OpenAI key 出错了: ${getErrText(error)}`);
    }

    logger.error('LLM response error', { request: body, error });
    // Relay "no available channel" (F2-S4-TC04) → ModelErrEnum.noAvailableChannel;
    // other errors pass through unchanged.
    return Promise.reject(normalizeRelayNoChannelError(error));
  }
};
