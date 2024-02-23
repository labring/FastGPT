import type { UserModelSchema } from '@fastgpt/global/support/user/type';
import OpenAI from '@fastgpt/global/core/ai';

export const openaiBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
export const baseUrl = process.env.ONEAPI_URL || openaiBaseUrl;

export const systemAIChatKey = process.env.CHAT_API_KEY || '';

export const getAIApi = (props?: {
  userKey?: UserModelSchema['openaiAccount'];
  timeout?: number;
}) => {
  const { userKey, timeout } = props || {};
  return new OpenAI({
    apiKey: userKey?.key || systemAIChatKey,
    baseURL: userKey?.baseUrl || baseUrl,
    httpAgent: global.httpsAgent,
    timeout,
    maxRetries: 2
  });
};
