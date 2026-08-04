import { getErrText } from '@fastgpt/global/common/error/utils';
import type { UnStreamResponseType } from '@fastgpt/global/core/ai/llm/type';
import { getAIApi } from '../../config';
import { getLogger, LogCategories } from '../../../../common/logger';
import { isStreamCompletionResponse } from './response/normalize';
import type { CreateChatCompletionProps, CreateChatCompletionResult } from './types';

const logger = getLogger(LogCategories.MODULE.AI.LLM);

/**
 * 执行一次真实的 chat.completions.create 请求。
 *
 * getAIApi 会根据 userKey 返回实际使用的 OpenAI 客户端和 requestMeta。
 * 当 requestMeta.usedUserOpenAIKey=true 时，说明请求已经走用户 key，
 * 这里必须避免继续叠加模型配置里的 requestUrl/requestAuth，防止覆盖用户自己的配置。
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
    if (!modelData) {
      return Promise.reject(`${body.model} not found`);
    }
    body.model = modelData.model;

    logger.debug('Start create chat completion', { model: body.model });

    // requestUrl/requestAuth 只属于系统模型配置。用户 key 请求由 getAIApi 内部完成 baseUrl/key 选择。
    const response = await ai.chat.completions.create(body, {
      ...options,
      ...(modelData.requestUrl && !requestMeta.usedUserOpenAIKey
        ? { path: modelData.requestUrl }
        : {}),
      headers: {
        ...options?.headers,
        ...(modelData.requestAuth && !requestMeta.usedUserOpenAIKey
          ? { Authorization: `Bearer ${modelData.requestAuth}` }
          : {})
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
    return Promise.reject(error);
  }
};
