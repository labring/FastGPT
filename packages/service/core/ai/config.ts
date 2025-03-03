import OpenAI from '@fastgpt/global/core/ai';
import {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  StreamChatType,
  UnStreamChatType
} from '@fastgpt/global/core/ai/type';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { addLog } from '../../common/system/log';
import { i18nT } from '../../../web/i18n/utils';
import { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import { getLLMModel } from './model';

const aiProxyBaseUrl = process.env.AIPROXY_API_ENDPOINT
  ? `${process.env.AIPROXY_API_ENDPOINT}/v1`
  : undefined;
const openaiBaseUrl = aiProxyBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const openaiBaseKey = process.env.AIPROXY_API_TOKEN || process.env.CHAT_API_KEY || '';

export const getAIApi = (props?: { userKey?: OpenaiAccountType; timeout?: number }) => {
  const { userKey, timeout } = props || {};

  const baseUrl = userKey?.baseUrl || global?.systemEnv?.oneapiUrl || openaiBaseUrl;
  const apiKey = userKey?.key || global?.systemEnv?.chatApiKey || openaiBaseKey;
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

  const baseUrl = userKey?.baseUrl || global?.systemEnv?.oneapiUrl || openaiBaseUrl;
  const apiKey = userKey?.key || global?.systemEnv?.chatApiKey || openaiBaseKey;

  return {
    baseUrl,
    authorization: `Bearer ${apiKey}`
  };
};

export const createChatCompletion = async ({
  body,
  userKey,
  timeout,
  options
}: {
  body: ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming;
  userKey?: OpenaiAccountType;
  timeout?: number;
  options?: OpenAI.RequestOptions;
}): Promise<
  {
    getEmptyResponseTip: () => string;
  } & (
    | {
        response: StreamChatType;
        isStreamResponse: true;
      }
    | {
        response: UnStreamChatType;
        isStreamResponse: false;
      }
  )
> => {
  try {
    const modelConstantsData = getLLMModel(body.model);

    const formatTimeout = timeout ? timeout : body.stream ? 60000 : 600000;
    const ai = getAIApi({
      userKey,
      timeout: formatTimeout
    });

    const response = await ai.chat.completions.create(body, {
      ...options,
      ...(modelConstantsData.requestUrl ? { path: modelConstantsData.requestUrl } : {}),
      headers: {
        ...options?.headers,
        ...(modelConstantsData.requestAuth
          ? { Authorization: `Bearer ${modelConstantsData.requestAuth}` }
          : {})
      }
    });

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

    if (isStreamResponse) {
      return {
        response,
        isStreamResponse: true,
        getEmptyResponseTip
      };
    }

    return {
      response,
      isStreamResponse: false,
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
