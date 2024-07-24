import type { UserModelSchema } from '@fastgpt/global/support/user/type';
import OpenAI from '@fastgpt/global/core/ai';

export const openaiBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

export const getAIApi = (props?: {
  userKey?: UserModelSchema['openaiAccount'];
  timeout?: number;
}) => {
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

export const getAxiosConfig = (props?: { userKey?: UserModelSchema['openaiAccount'] }) => {
  const { userKey } = props || {};

  const baseUrl =
    userKey?.baseUrl || global?.systemEnv?.oneapiUrl || process.env.ONEAPI_URL || openaiBaseUrl;
  const apiKey = userKey?.key || global?.systemEnv?.chatApiKey || process.env.CHAT_API_KEY || '';

  return {
    baseUrl,
    authorization: `Bearer ${apiKey}`
  };
};
