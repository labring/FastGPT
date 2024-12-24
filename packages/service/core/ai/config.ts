import OpenAI from '@fastgpt/global/core/ai';
import {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming
} from '@fastgpt/global/core/ai/type';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { addLog } from '../../common/system/log';
import { i18nT } from '../../../web/i18n/utils';
import { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';

export const openaiBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

export const getAIApi = (props?: { userKey?: OpenaiAccountType; timeout?: number }) => {
  const { userKey, timeout } = props || {};

  const baseUrl =
    userKey?.baseUrl || global?.systemEnv?.oneapiUrl || process.env.ONEAPI_URL || openaiBaseUrl;
  const apiKey = userKey?.key || global?.systemEnv?.chatApiKey || process.env.CHAT_API_KEY || '';

  return new OpenAI({
    baseURL: baseUrl,
    apiKey,
    httpAgent: global.httpsAgent,
    timeout,
    maxRetries: 2
  });
};

export const getAxiosConfig = (props?: { userKey?: OpenaiAccountType }) => {
  const { userKey } = props || {};

  const baseUrl =
    userKey?.baseUrl || global?.systemEnv?.oneapiUrl || process.env.ONEAPI_URL || openaiBaseUrl;
  const apiKey = userKey?.key || global?.systemEnv?.chatApiKey || process.env.CHAT_API_KEY || '';

  return {
    baseUrl,
    authorization: `Bearer ${apiKey}`
  };
};

type CompletionsBodyType =
  | ChatCompletionCreateParamsNonStreaming
  | ChatCompletionCreateParamsStreaming;
type InferResponseType<T extends CompletionsBodyType> =
  T extends ChatCompletionCreateParamsStreaming
    ? OpenAI.Chat.Completions.ChatCompletionChunk
    : OpenAI.Chat.Completions.ChatCompletion;

export const createChatCompletion = async <T extends CompletionsBodyType>({
  body,
  userKey,
  timeout,
  options
}: {
  body: T;
  userKey?: OpenaiAccountType;
  timeout?: number;
  options?: OpenAI.RequestOptions;
}): Promise<{
  response: InferResponseType<T>;
  isStreamResponse: boolean;
  getEmptyResponseTip: () => string;
}> => {
  try {
    const formatTimeout = timeout ? timeout : body.stream ? 60000 : 600000;
    const ai = getAIApi({
      userKey,
      timeout: formatTimeout
    });
    const response = await ai.chat.completions.create(body, options);

    const isStreamResponse =
      typeof response === 'object' &&
      response !== null &&
      ('iterator' in response || 'controller' in response);

    const getEmptyResponseTip = () => {
      addLog.warn(`LLM response empty`, {
        baseUrl: userKey?.baseUrl,
        requestBody: body
      });
      if (userKey?.baseUrl) {
        return `您的 OpenAI key 没有响应: ${JSON.stringify(body)}`;
      }
      return i18nT('chat:LLM_model_response_empty');
    };

    return {
      response: response as InferResponseType<T>,
      isStreamResponse,
      getEmptyResponseTip
    };
  } catch (error) {
    addLog.error(`LLM response error`, error);
    addLog.warn(`LLM response error`, {
      baseUrl: userKey?.baseUrl,
      requestBody: body
    });
    if (userKey?.baseUrl) {
      return Promise.reject(`您的 OpenAI key 出错了: ${getErrText(error)}`);
    }
    return Promise.reject(error);
  }
};
