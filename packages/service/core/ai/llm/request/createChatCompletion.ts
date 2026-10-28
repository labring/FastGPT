import { getErrText, UserConfigError } from '@fastgpt/global/common/error/utils';
import type { UnStreamResponseType } from '@fastgpt/global/core/ai/llm/type';
import OpenAI from '@fastgpt/global/core/ai';
import { getAIApi, getModelOpenAIOptions } from '../../config';
import { normalizeRelayNoChannelError } from '../../../../thirdProvider/aiproxy/error';
import { getLogger, LogCategories } from '../../../../common/logger';
import { isStreamCompletionResponse } from './response/normalize';
import type { CreateChatCompletionProps, CreateChatCompletionResult } from './types';
import { sanitizeLLMRequestRecordPayload } from '../../record/controller';

const logger = getLogger(LogCategories.MODULE.AI.LLM);

/**
 * 判断错误是否为请求被中断（用户取消、探活请求提前结束等）。
 *
 * OpenAI SDK 的 APIUserAbortError 没有设置 name（仍是 'Error'），不能用 error.name 判断；
 * 跨 SDK 副本时 instanceof 也可能失效，因此再以 SDK 的固定文案兜底。
 */
const isAbortedRequestError = (error: unknown): boolean =>
  error instanceof OpenAI.APIUserAbortError ||
  (error instanceof Error && error.message === 'Request was aborted.');

/**
 * 执行一次真实的 chat.completions.create 请求。
 *
 * getAIApi 会根据 userKey 返回实际使用的 OpenAI 客户端和 requestMeta。
 * 当 requestMeta.usedUserOpenAIKey=true 时，说明请求已经走用户 key，
 * 这里必须避免继续叠加模型配置里的 requestUrl/requestAuth，防止覆盖用户自己的配置。
 * 失败日志与 Mongo 请求记录共用 base64 清洗快照，不修改实际请求或原始异常。
 * 用户 key 的所有请求失败统一记录 info，并用 UserConfigError 保留原始 cause，供上层降噪。
 */
export const createChatCompletion = async ({
  modelData,
  body,
  userKey,
  timeout,
  onRequestStart,
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
    onRequestStart?.();

    const modelOptions = getModelOpenAIOptions({
      model: modelData,
      userKey,
      baseUrl: requestMeta.baseUrl,
      headers: options?.headers as Record<string, string> | undefined
    });

    const response = await ai.chat.completions.create(body, {
      ...options,
      ...modelOptions
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
      const errorSnapshot = sanitizeLLMRequestRecordPayload({
        baseUrl: requestMeta.baseUrl,
        request: body,
        error
      });
      // 用户自行配置的服务统一保留本地 info，不按状态码区分，也不导出到 OTel。
      logger.info('User AI API error', { ...errorSnapshot, otel: false });
      return Promise.reject(
        new UserConfigError(`您的 OpenAI key 出错了: ${getErrText(error)}`, undefined, {
          cause: error
        })
      );
    }

    // 平台请求被中断不是真实的上游故障，沿用 warn 和原始异常。
    if (isAbortedRequestError(error)) {
      logger.warn('LLM request aborted');
      return Promise.reject(error);
    }

    const errorSnapshot = sanitizeLLMRequestRecordPayload({
      request: body,
      error
    });
    logger.error('LLM response error', errorSnapshot);
    return Promise.reject(normalizeRelayNoChannelError(error));
  }
};
